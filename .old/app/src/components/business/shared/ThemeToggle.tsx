import { Moon, Sun } from "lucide-react"
import { useTheme } from "./ThemeProvider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../ui/tooltip"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex items-center justify-center size-8 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          <span className="sr-only">Toggle theme</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {isDark ? "切换亮色主题" : "切换暗色主题"}
      </TooltipContent>
    </Tooltip>
  )
}
