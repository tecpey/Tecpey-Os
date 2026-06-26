"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [isDark, setIsDark] = useState(theme === 'dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return null
    }


    const handleThemeToggle = (theme: boolean) => {
        setTheme(theme ? 'dark' : 'light');
        setIsDark(theme)
    };


    return (
        <button
            onClick={() => handleThemeToggle(!isDark)}
            className="flex items-center justify-center transition-all duration-300 hover:text-primary opacity-70 hover:opacity-100"
            aria-label="Toggle Theme"
        >
            {isDark ? (
                <Sun size={18} className="cursor-pointer" />
            ) : (
                <Moon size={18} className="cursor-pointer" />
            )}
        </button>
    );
}
