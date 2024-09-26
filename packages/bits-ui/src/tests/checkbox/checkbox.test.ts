import { render } from "@testing-library/svelte/svelte5";
import { axe } from "jest-axe";
import { describe, it } from "vitest";
import { tick } from "svelte";
import { getTestKbd, setupUserEvents } from "../utils.js";
import CheckboxTest from "./checkbox-test.svelte";
import type { Checkbox } from "$lib/index.js";

const kbd = getTestKbd();

function setup(props?: Checkbox.RootProps) {
	const user = setupUserEvents();
	// @ts-expect-error - testing lib needs to update their generic types
	const returned = render(CheckboxTest, props);
	const root = returned.getByTestId("root");
	const input = document.querySelector("input") as HTMLInputElement;
	return {
		...returned,
		root,
		input,
		user,
	};
}

describe("checkbox", () => {
	it("should have no accessibility violations", async () => {
		// @ts-expect-error - testing lib needs to update their generic types
		const { container } = render(CheckboxTest);
		expect(await axe(container)).toHaveNoViolations();
	});

	it("should have bits data attrs", async () => {
		const { root } = setup();
		expect(root).toHaveAttribute("data-checkbox-root");
	});

	it("should not render the checkbox input if a name prop isnt passed", async () => {
		const { input } = setup({ name: "" });
		expect(input).not.toBeInTheDocument();
	});

	it("should render the checkbox input if a name prop is passed", async () => {
		const { input } = setup({ name: "checkbox" });
		expect(input).toBeInTheDocument();
	});

	it('should default the value to "on", when no value prop is passed', async () => {
		const { input } = setup();
		expect(input).toHaveAttribute("value", "on");
	});

	it("should be able to be indeterminate", async () => {
		const { getByTestId, root, input } = setup({ checked: "indeterminate" });
		const indicator = getByTestId("indicator");
		expect(root).toHaveAttribute("data-state", "indeterminate");
		expect(root).toHaveAttribute("aria-checked", "mixed");
		expect(input.checked).toBe(false);
		expect(indicator).toHaveTextContent("indeterminate");
		expect(indicator).not.toHaveTextContent("true");
		expect(indicator).not.toHaveTextContent("false");
	});

	it("should toggle when clicked", async () => {
		const { getByTestId, root, input, user } = setup();
		const indicator = getByTestId("indicator");
		expect(root).toHaveAttribute("data-state", "unchecked");
		expect(root).toHaveAttribute("aria-checked", "false");
		expect(input.checked).toBe(false);
		expect(indicator).toHaveTextContent("false");
		expect(indicator).not.toHaveTextContent("true");
		expect(indicator).not.toHaveTextContent("indeterminate");
		await user.click(root);
		expect(root).toHaveAttribute("data-state", "checked");
		expect(root).toHaveAttribute("aria-checked", "true");
		expect(input.checked).toBe(true);
		expect(indicator).toHaveTextContent("true");
		expect(indicator).not.toHaveTextContent("false");
		expect(indicator).not.toHaveTextContent("indeterminate");
	});

	it("should toggle when the `Space` key is pressed", async () => {
		const { root, input, user } = setup();
		expect(root).toHaveAttribute("data-state", "unchecked");
		expect(root).toHaveAttribute("aria-checked", "false");
		expect(input.checked).toBe(false);
		root.focus();
		await user.keyboard(kbd.SPACE);
		expect(root).toHaveAttribute("data-state", "checked");
		expect(root).toHaveAttribute("aria-checked", "true");
		expect(input.checked).toBe(true);
	});

	it("should not toggle when the `Enter` key is pressed", async () => {
		const { getByTestId, root, input, user } = setup();
		const indicator = getByTestId("indicator");
		expect(root).toHaveAttribute("data-state", "unchecked");
		expect(root).toHaveAttribute("aria-checked", "false");
		expect(input.checked).toBe(false);
		expect(indicator).toHaveTextContent("false");
		expect(indicator).not.toHaveTextContent("true");
		expect(indicator).not.toHaveTextContent("indeterminate");
		root.focus();
		await user.keyboard(kbd.ENTER);
		expect(root).not.toHaveAttribute("data-state", "checked");
		expect(root).not.toHaveAttribute("aria-checked", "true");
		expect(indicator).toHaveTextContent("false");
		expect(indicator).not.toHaveTextContent("true");
		expect(indicator).not.toHaveTextContent("indeterminate");
		expect(input.checked).toBe(false);
	});

	it("should be disabled when the `disabled` prop is passed", async () => {
		const { root, input, user } = setup({ disabled: true });
		expect(root).toHaveAttribute("data-state", "unchecked");
		expect(root).toHaveAttribute("aria-checked", "false");
		expect(input.checked).toBe(false);
		expect(input.disabled).toBe(true);
		await user.click(root);
		expect(root).toHaveAttribute("data-state", "unchecked");
		expect(root).toHaveAttribute("aria-checked", "false");
		expect(root).toBeDisabled();
		expect(input.checked).toBe(false);
	});

	it("should be required when the `required` prop is passed", async () => {
		const { root, input } = setup({ required: true });
		expect(root).toHaveAttribute("aria-required", "true");
		expect(input.required).toBe(true);
	});

	it('should fire the "onChange" callback when changing', async () => {
		let newValue: boolean | "indeterminate" = false;
		function onCheckedChange(next: boolean | "indeterminate") {
			newValue = next;
		}
		const { root, user } = setup({ onCheckedChange });
		await user.click(root);
		expect(newValue).toBe(true);
	});

	it("should respect binding the `checked` prop", async () => {
		const { root, getByTestId, user } = setup();
		const binding = getByTestId("binding");
		expect(binding).toHaveTextContent("false");
		await user.click(root);
		await tick();
		expect(binding).toHaveTextContent("true");
	});
});