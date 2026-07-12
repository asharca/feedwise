import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArticleDrawer } from "@/components/article/article-drawer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ArticleDrawer", () => {
  it("keeps keyboard focus inside the open drawer and closes on Escape", async () => {
    const onClose = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
      length: 1,
    } as DOMRectList);
    const drawer = (close: () => void) =>
      createElement(
        ArticleDrawer,
        { open: true, onClose: close } as ComponentProps<typeof ArticleDrawer>,
        createElement("button", { type: "button" }, "First action"),
        createElement("button", { type: "button" }, "Last action"),
      );
    const { rerender } = render(drawer(onClose));

    const dialog = screen.getByRole("dialog", { name: "Article reader" });
    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });

    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    const replacementOnClose = vi.fn();
    rerender(drawer(replacementOnClose));
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(replacementOnClose).toHaveBeenCalledTimes(1);
  });
});
