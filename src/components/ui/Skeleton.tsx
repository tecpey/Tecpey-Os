export default function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-white/10 rounded-xl ${className}`}
    />
  );
}
