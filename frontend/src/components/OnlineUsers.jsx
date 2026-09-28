const AVATAR_COLORS = ["#0e7d6c", "#b45309", "#a04e2f", "#55685f", "#7d5a1e"];

function colorFor(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export default function OnlineUsers({ users }) {
  const shown = users.slice(0, 4);
  const extra = users.length - shown.length;

  return (
    <div className="online-users" title={`Online: ${users.join(", ")}`}>
      <div className="online-avatars">
        {shown.map((u) => (
          <span
            key={u}
            className="avatar"
            style={{ backgroundColor: colorFor(u) }}
          >
            {u.slice(0, 1).toUpperCase()}
          </span>
        ))}
        {extra > 0 && <span className="avatar avatar-more">+{extra}</span>}
      </div>
      <span className="online-count">
        <span className="online-dot" aria-hidden="true" />
        {users.length} online
      </span>
    </div>
  );
}
