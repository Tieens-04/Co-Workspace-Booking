/** First focusable element on every layout; jumps past navigation to <main>. */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60]"
    >
      Bỏ qua đến nội dung chính
    </a>
  );
}
