<script lang="ts" generics="T extends string | number">
	import { type WritableBox, box } from "svelte-toolbelt";
	import { useSelectRoot } from "../select.svelte.js";
	import type { SelectRootProps } from "../types.js";
	import SelectHiddenInput from "./select-hidden-input.svelte";
	import { noop } from "$lib/internal/noop.js";
	import FloatingLayer from "$lib/bits/utilities/floating-layer/components/floating-layer.svelte";

	let {
		value = $bindable(),
		onValueChange = noop,
		name = "",
		disabled = false,
		type,
		open = $bindable(false),
		onOpenChange = noop,
		loop = false,
		scrollAlignment = "nearest",
		required = false,
		controlledOpen = false,
		controlledValue = false,
		items = [],
		allowDeselect = true,
		children,
	}: SelectRootProps<T> = $props();

	if (value === undefined) {
		const defaultValue = type === "single" ? undefined : [];
		if (controlledValue) {
			onValueChange(defaultValue as any);
		} else {
			value = defaultValue;
		}
	}

	const rootState = useSelectRoot({
		type,
		value: box.with(
			() => value!,
			(v) => {
				if (controlledValue) {
					onValueChange(v as any);
				} else {
					value = v;
					onValueChange(v as any);
				}
			}
		) as WritableBox<T> | WritableBox<T[]>,
		disabled: box.with(() => disabled),
		required: box.with(() => required),
		open: box.with(
			() => open,
			(v) => {
				if (controlledOpen) {
					onOpenChange(v);
				} else {
					open = v;
					onOpenChange(v);
				}
			}
		),
		loop: box.with(() => loop),
		scrollAlignment: box.with(() => scrollAlignment),
		name: box.with(() => name),
		isCombobox: false,
		items: box.with(() => items),
		allowDeselect: box.with(() => allowDeselect),
	});
</script>

<FloatingLayer>
	{@render children?.()}
</FloatingLayer>

{#if Array.isArray(rootState.value.current)}
	{#if rootState.value.current.length === 0}
		<SelectHiddenInput value="" />
	{:else}
		{#each rootState.value.current as item}
			<SelectHiddenInput value={item} />
		{/each}
	{/if}
{:else if rootState.value.current === undefined}
	<SelectHiddenInput value="" />
{:else}
	<SelectHiddenInput bind:value={rootState.value.current as string} />
{/if}
