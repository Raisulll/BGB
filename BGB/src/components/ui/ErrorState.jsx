/** Shown when an API request for a page section fails; offers a retry. */
export default function ErrorState({ message = 'Could not load data.', onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-4 py-10 text-center sm:py-14">
      <i className="fas fa-exclamation-triangle mb-3 text-3xl text-amber-500" />
      <p className="text-sm font-medium text-gray-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary mt-3">
          <i className="fas fa-redo" /> Retry
        </button>
      )}
    </div>
  );
}
