"use client";
import { useEffect } from "react";

/**
 * Keeps --hdr = the height of the page header while it stays pinned at the top (computer / iPad), 0 when it scrolls away (phone).
 * A list's box is sized to the screen less the header, so when you scroll the page the list's headings can't slide off
 * the screen - they stop just under the tabs (Carter, 2026-10-14).
 */
export function HeaderSize() {
  useEffect(() => {
    const h = document.getElementById("site-header");
    if (!h) return;
    const set = () => {
      const pinned = getComputedStyle(h).position === "sticky";
      document.documentElement.style.setProperty("--hdr", `${pinned ? Math.ceil(h.getBoundingClientRect().height) : 0}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(h);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
    };
  }, []);
  return null;
}
