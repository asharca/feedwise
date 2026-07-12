import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FilterDropdown } from "@/components/search/filter-dropdown";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OPTIONS = [
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
  { id: "gamma", label: "Gamma" },
];

describe("FilterDropdown", () => {
  it("supports arrow, Home, End, and Space selection from the keyboard", async () => {
    const onSelect = vi.fn();
    render(
      createElement(FilterDropdown, {
        label: "Feed",
        loadOptions: vi.fn().mockResolvedValue(OPTIONS),
        onSelect,
      }),
    );

    const trigger = screen.getByRole("button", { name: "Feed" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const alpha = await screen.findByRole("option", { name: "Alpha" });
    const beta = screen.getByRole("option", { name: "Beta" });
    const gamma = screen.getByRole("option", { name: "Gamma" });
    await waitFor(() => expect(document.activeElement).toBe(alpha));

    fireEvent.keyDown(alpha, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(beta));

    fireEvent.keyDown(beta, { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(alpha));

    fireEvent.keyDown(alpha, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(gamma));

    fireEvent.keyDown(gamma, { key: " " });
    expect(onSelect).toHaveBeenCalledWith("gamma");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens with Enter, closes with Escape, and restores trigger focus", async () => {
    render(
      createElement(FilterDropdown, {
        label: "Tag",
        loadOptions: vi.fn().mockResolvedValue(OPTIONS),
        onSelect: vi.fn(),
      }),
    );

    const trigger = screen.getByRole("button", { name: "Tag" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });

    const alpha = await screen.findByRole("option", { name: "Alpha" });
    await waitFor(() => expect(document.activeElement).toBe(alpha));
    fireEvent.keyDown(alpha, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
