export default function Spinner({ fullScreen = false }) {
  return (
    <div className={`flex items-center justify-center ${fullScreen ? 'h-screen' : 'py-20'}`}>
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-bgb-100 border-t-bgb-500" role="status" aria-label="Loading" />
    </div>
  );
}
