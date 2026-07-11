type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
}

const labels: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Live',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting…',
};

const colors: Record<ConnectionStatus, string> = {
  connecting: 'bg-amber-100 text-amber-800',
  connected: 'bg-emerald-100 text-emerald-800',
  disconnected: 'bg-red-100 text-red-800',
  reconnecting: 'bg-amber-100 text-amber-800',
};

export default function ConnectionStatusBadge({ status, onReconnect }: ConnectionStatusBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${colors[status]}`}>
        {labels[status]}
      </span>
      {(status === 'disconnected' || status === 'reconnecting') && onReconnect && (
        <button
          onClick={onReconnect}
          className="text-xs font-medium text-teal-700 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
