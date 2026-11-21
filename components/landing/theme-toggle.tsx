"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function handleToggle() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label="切换明暗主题"
      title="切换明暗主题"
      className="relative size-8 rounded-md text-muted-foreground hover:text-foreground"
    >
      <Sun
        aria-hidden="true"
        className="size-4 rotate-0 scale-100 transition-transform motion-reduce:transition-none dark:-rotate-90 dark:scale-0"
      />
      <Moon
        aria-hidden="true"
        className="absolute size-4 rotate-90 scale-0 transition-transform motion-reduce:transition-none dark:rotate-0 dark:scale-100"
      />
    </Button>
  );
}
