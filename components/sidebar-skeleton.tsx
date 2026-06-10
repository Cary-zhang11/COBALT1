export function SidebarSkeleton() {
  return (
    <aside className="w-64 border-r bg-card flex flex-col animate-pulse">
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-200" />
          <div>
            <div className="h-5 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-100 rounded mt-1" />
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 bg-gray-100 rounded-lg" />
        ))}
      </nav>
      <div className="p-4 border-t">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gray-200" />
          <div className="h-4 w-20 bg-gray-100 rounded" />
        </div>
      </div>
    </aside>
  );
}
