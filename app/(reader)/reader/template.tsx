/**
 * Reader sub-section template — keyed at the reader/ segment level so a
 * restrained fade plays when switching between the reader index, history,
 * and tags pages. Search-param navigation inside /reader does not remount
 * (so reader state and the list↔reader spring are preserved).
 */
export default function ReaderSectionTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full animate-in fade-in duration-300 ease-[var(--ease-out)] motion-reduce:animate-none">
      {children}
    </div>
  );
}
