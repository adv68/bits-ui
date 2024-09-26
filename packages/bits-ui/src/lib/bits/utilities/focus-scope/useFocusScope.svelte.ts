import { untrack } from "svelte";
import { box } from "svelte-toolbelt";
import {
	createFocusScopeAPI,
	createFocusScopeStack,
	removeLinks,
} from "./focus-scope-stack.svelte.js";
import { focus, focusFirst, getTabbableCandidates, getTabbableEdges } from "$lib/internal/focus.js";
import type { ReadableBoxedValues } from "$lib/internal/box.svelte.js";
import { type EventCallback, addEventListener } from "$lib/internal/events.js";
import { useRefById } from "$lib/internal/useRefById.svelte.js";
import { isHTMLElement } from "$lib/internal/is.js";
import { executeCallbacks } from "$lib/internal/callbacks.js";
import { kbd } from "$lib/internal/kbd.js";
import { afterTick } from "$lib/internal/afterTick.js";

const AUTOFOCUS_ON_MOUNT = "focusScope.autoFocusOnMount";
const AUTOFOCUS_ON_DESTROY = "focusScope.autoFocusOnDestroy";
const EVENT_OPTIONS = { bubbles: false, cancelable: true };

type UseFocusScopeProps = ReadableBoxedValues<{
	/**
	 * ID of the focus scope container node.
	 */
	id: string;
	/**
	 * When `true` will loop through the tabbable elements in the focus scope.
	 *
	 * @defaultValue false
	 */
	loop: boolean;

	/**
	 * Whether focus is trapped within the focus scope.
	 *
	 * @defaultValue false
	 */
	enabled: boolean;

	/**
	 * Event handler called when auto-focusing onMount.
	 * Can be prevented.
	 */
	onOpenAutoFocus: EventCallback;

	/**
	 * Event handler called when auto-focusing onDestroy.
	 * Can be prevented.
	 */
	onCloseAutoFocus: EventCallback;
}>;

export type FocusScopeContainerProps = {
	id: string;
	tabindex: number;
	onkeydown: EventCallback<KeyboardEvent>;
};

export function useFocusScope({
	id,
	loop,
	enabled,
	onOpenAutoFocus,
	onCloseAutoFocus,
}: UseFocusScopeProps) {
	const focusScopeStack = createFocusScopeStack();
	const focusScope = createFocusScopeAPI();
	const ref = box<HTMLElement | null>(null);

	useRefById({
		id,
		ref,
		condition: () => enabled.current,
	});

	let lastFocusedElement = $state<HTMLElement | null>(null);

	$effect(() => {
		const container = ref.current;
		if (!container) return;
		if (!enabled.current) return;

		function handleFocusIn(event: FocusEvent) {
			if (focusScope.paused || !container) return;
			const target = event.target;
			if (!isHTMLElement(target)) return;
			if (container.contains(target)) {
				lastFocusedElement = target;
			} else {
				focus(lastFocusedElement, { select: true });
			}
		}

		function handleFocusOut(event: FocusEvent) {
			if (focusScope.paused || !container) return;
			const relatedTarget = event.relatedTarget;
			if (!isHTMLElement(relatedTarget)) return;
			// A `focusout` event with a `null` `relatedTarget` will happen in at least two cases:
			//
			// 1. When the user switches app/tabs/windows/the browser itself loses focus.
			// 2. In Google Chrome, when the focused element is removed from the DOM.
			//
			// We let the browser do its thing here because:
			//
			// 1. The browser already keeps a memory of what's focused for when the
			// page gets refocused.
			// 2. In Google Chrome, if we try to focus the deleted focused element it throws
			// the CPU to 100%, so we avoid doing anything for this reason here too.
			if (relatedTarget === null) return;

			// If the focus has moved to an actual legitimate element (`relatedTarget !== null`)
			// that is outside the container, we move focus to the last valid focused element inside.
			if (!container.contains(relatedTarget)) focus(lastFocusedElement, { select: true });
		}

		// When the focused element gets removed from the DOM, browsers move focus
		// back to the document.body. In this case, we move focus to the container
		// to keep focus trapped correctly.
		// instead of leaning on document.activeElement, we use lastFocusedElement to check
		// if the element still exists inside the container,
		// if not then we focus to the container
		function handleMutations(_: MutationRecord[]) {
			const lastFocusedElementExists = container?.contains(lastFocusedElement);
			if (!lastFocusedElementExists) {
				focus(container);
			}
		}

		const unsubEvents = executeCallbacks(
			addEventListener(document, "focusin", handleFocusIn),
			addEventListener(document, "focusout", handleFocusOut)
		);
		const mutationObserver = new MutationObserver(handleMutations);
		if (container) {
			mutationObserver.observe(container, { childList: true, subtree: true });
		}

		return () => {
			unsubEvents();
			mutationObserver.disconnect();
		};
	});

	$effect(() => {
		let container = untrack(() => ref.current);
		const previouslyFocusedElement = document.activeElement as HTMLElement | null;
		untrack(() => {
			if (!container) {
				container = document.getElementById(untrack(() => id.current));
			}
			if (!container) return;
			untrack(() => focusScopeStack.add(focusScope));
			const hasFocusedCandidate = container.contains(previouslyFocusedElement);

			if (!hasFocusedCandidate) {
				const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);
				container.addEventListener(
					AUTOFOCUS_ON_MOUNT,
					untrack(() => onOpenAutoFocus.current)
				);
				container.dispatchEvent(mountEvent);

				if (!mountEvent.defaultPrevented) {
					afterTick(() => {
						if (!container) return;
						focusFirst(removeLinks(getTabbableCandidates(container)), { select: true });

						if (document.activeElement === previouslyFocusedElement) {
							focus(container);
						}
					});
				}
			}
		});

		return () => {
			if (!container) return;
			container.removeEventListener(
				AUTOFOCUS_ON_MOUNT,
				untrack(() => onOpenAutoFocus.current)
			);

			const destroyEvent = new CustomEvent(AUTOFOCUS_ON_DESTROY, EVENT_OPTIONS);
			container.addEventListener(
				AUTOFOCUS_ON_DESTROY,
				untrack(() => onCloseAutoFocus.current)
			);
			container.dispatchEvent(destroyEvent);

			setTimeout(() => {
				if (!destroyEvent.defaultPrevented && previouslyFocusedElement) {
					focus(previouslyFocusedElement ?? document.body, { select: true });
				}

				container?.removeEventListener(AUTOFOCUS_ON_DESTROY, onCloseAutoFocus.current);

				focusScopeStack.remove(focusScope);
			}, 0);
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (!enabled.current) return;
		if (!loop.current && !enabled.current) return;
		if (focusScope.paused) return;

		const isTabKey = e.key === kbd.TAB && !e.ctrlKey && !e.altKey && !e.metaKey;
		const focusedElement = document.activeElement as HTMLElement | null;

		if (!(isTabKey && focusedElement)) return;
		const container = ref.current;
		if (!container) return;

		const [first, last] = getTabbableEdges(container);
		const hasTabbableElementsInside = first && last;

		if (!hasTabbableElementsInside) {
			if (focusedElement === container) {
				e.preventDefault();
			}
		} else {
			if (!e.shiftKey && focusedElement === last) {
				e.preventDefault();
				if (loop.current) focus(first, { select: true });
			} else if (e.shiftKey && focusedElement === first) {
				e.preventDefault();
				if (loop.current) focus(last, { select: true });
			}
		}
	}

	const props: FocusScopeContainerProps = $derived({
		id: id.current,
		tabindex: -1,
		onkeydown: handleKeydown,
	});

	return {
		get props() {
			return props;
		},
	};
}