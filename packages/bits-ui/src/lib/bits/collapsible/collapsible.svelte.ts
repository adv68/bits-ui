import { getContext, setContext } from "svelte";
import { getAriaExpanded, getDataDisabled, getDataOpenClosed } from "$lib/internal/attrs.js";
import {
	type Box,
	type BoxedValues,
	type ReadonlyBox,
	type ReadonlyBoxedValues,
	boxedState,
	readonlyBox,
	readonlyBoxedState,
} from "$lib/internal/box.svelte.js";
import { generateId } from "$lib/internal/id.js";
import { styleToString } from "$lib/internal/style.js";
import { type EventCallback, composeHandlers } from "$lib/internal/events.js";
import type { StyleProperties } from "$lib/shared/index.js";
import { withTick } from "$lib/internal/with-tick.js";
import { useNodeById } from "$lib/internal/elements.svelte.js";
import { verifyContextDeps } from "$lib/internal/context.js";

type CollapsibleRootStateProps = BoxedValues<{
	open: boolean;
}> &
	ReadonlyBoxedValues<{
		disabled: boolean;
	}>;

class CollapsibleRootState {
	open = undefined as unknown as Box<boolean>;
	disabled = undefined as unknown as ReadonlyBox<boolean>;
	contentId = readonlyBoxedState(generateId());
	props = $derived({
		"data-state": getDataOpenClosed(this.open.value),
		"data-disabled": getDataDisabled(this.disabled.value),
		"data-collapsible-root": "",
	} as const);

	constructor(props: CollapsibleRootStateProps) {
		this.open = props.open;
		this.disabled = props.disabled;
	}

	toggleOpen() {
		this.open.value = !this.open.value;
	}

	createContent(props: CollapsibleContentStateProps) {
		return new CollapsibleContentState(props, this);
	}

	createTrigger(props: CollapsibleTriggerStateProps) {
		return new CollapsibleTriggerState(props, this);
	}
}

type CollapsibleContentStateProps = ReadonlyBoxedValues<{
	id: string;
	style: StyleProperties;
	forceMount: boolean;
}>;

class CollapsibleContentState {
	root = undefined as unknown as CollapsibleRootState;
	#originalStyles: { transitionDuration: string; animationName: string } | undefined;
	#styleProp = undefined as unknown as ReadonlyBox<StyleProperties>;
	node = boxedState<HTMLElement | null>(null);
	#isMountAnimationPrevented = $state(false);
	#width = $state(0);
	#height = $state(0);
	#forceMount = undefined as unknown as ReadonlyBox<boolean>;
	props = $derived({
		id: this.root.contentId.value,
		"data-state": getDataOpenClosed(this.root.open.value),
		"data-disabled": getDataDisabled(this.root.disabled.value),
		"data-collapsible-content": "",
		style: styleToString({
			...this.#styleProp.value,
			"--bits-collapsible-content-height": this.#height ? `${this.#height}px` : undefined,
			"--bits-collapsible-content-width": this.#width ? `${this.#width}px` : undefined,
		}),
	} as const);
	present = $derived(this.#forceMount.value || this.root.open.value);

	constructor(props: CollapsibleContentStateProps, root: CollapsibleRootState) {
		this.root = root;
		this.#isMountAnimationPrevented = root.open.value;
		this.#forceMount = props.forceMount;
		this.root.contentId = props.id;
		this.#styleProp = props.style;

		this.node = useNodeById(this.root.contentId);

		$effect.pre(() => {
			const rAF = requestAnimationFrame(() => {
				this.#isMountAnimationPrevented = false;
			});

			return () => {
				cancelAnimationFrame(rAF);
			};
		});

		$effect(() => {
			// eslint-disable-next-line no-unused-expressions
			this.present;
			const node = this.node.value;
			if (!node) return;

			withTick(() => {
				if (!this.node) return;
				// get the dimensions of the element
				this.#originalStyles = this.#originalStyles || {
					transitionDuration: node.style.transitionDuration,
					animationName: node.style.animationName,
				};

				// block any animations/transitions so the element renders at full dimensions
				node.style.transitionDuration = "0s";
				node.style.animationName = "none";

				const rect = node.getBoundingClientRect();
				this.#height = rect.height;
				this.#width = rect.width;

				// unblock any animations/transitions that were originally set if not the initial render
				if (!this.#isMountAnimationPrevented) {
					const { animationName, transitionDuration } = this.#originalStyles;
					node.style.transitionDuration = transitionDuration;
					node.style.animationName = animationName;
				}
			});
		});
	}
}

type CollapsibleTriggerStateProps = ReadonlyBoxedValues<{
	onclick: EventCallback<MouseEvent>;
}>;

class CollapsibleTriggerState {
	#root = undefined as unknown as CollapsibleRootState;
	#composedClick = undefined as unknown as EventCallback<MouseEvent>;
	props = $derived({
		type: "button",
		"aria-controls": this.#root.contentId.value,
		"aria-expanded": getAriaExpanded(this.#root.open.value),
		"data-state": getDataOpenClosed(this.#root.open.value),
		"data-disabled": getDataDisabled(this.#root.disabled.value),
		disabled: this.#root.disabled.value,
		"data-collapsible-trigger": "",
		//
		onclick: this.#composedClick,
	} as const);

	constructor(props: CollapsibleTriggerStateProps, root: CollapsibleRootState) {
		this.#root = root;
		this.#composedClick = composeHandlers(props.onclick, this.#onclick);
	}

	#onclick = () => {
		this.#root.toggleOpen();
	};
}

export const COLLAPSIBLE_ROOT_KEY = Symbol("Collapsible.Root");

export function setCollapsibleRootState(props: CollapsibleRootStateProps) {
	return setContext(COLLAPSIBLE_ROOT_KEY, new CollapsibleRootState(props));
}

export function getCollapsibleRootState() {
	verifyContextDeps(COLLAPSIBLE_ROOT_KEY);
	return getContext<CollapsibleRootState>(COLLAPSIBLE_ROOT_KEY);
}

export function getCollapsibleTriggerState(
	props: CollapsibleTriggerStateProps
): CollapsibleTriggerState {
	return getCollapsibleRootState().createTrigger(props);
}

export function getCollapsibleContentState(
	props: CollapsibleContentStateProps
): CollapsibleContentState {
	return getCollapsibleRootState().createContent(props);
}