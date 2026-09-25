/**
 * Runs inline in <head> before first paint, so a theme picked in Settings
 * never flashes the system theme first. Kept out of lib/theme.ts, which is a
 * client module whose exports a server component cannot read as values.
 */
export const THEME_KEY = "chinese.theme";

/** Browser chrome colour per theme; matches --bg. */
export const THEME_COLORS = { light: "#ffffff", dark: "#111b21" } as const;

export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",t==="dark"?"${THEME_COLORS.dark}":"${THEME_COLORS.light}")})})}}catch(e){}`;
