export default function PortalTodayLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your meals">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-8 w-28 rounded-full bg-gray-100 animate-pulse" />
          <div className="h-9 w-24 rounded-lg bg-gray-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-7 gap-1 px-11">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-8 w-64 max-w-full rounded bg-gray-100 animate-pulse" />
        <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-gray-200 bg-gray-100 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
