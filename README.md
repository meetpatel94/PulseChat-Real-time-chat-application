# PulseChat

A real-time chat application with instant messaging, live typing indicators, online-user tracking, persistent history and automatic reconnection.

**Stack:** React (Vite) · Node.js · Express · Socket.io · MongoDB (Mongoose)

---

## Features

- **Dummy username login** — enter a name, you're in. No passwords, no auth complexity.
- **Real-time messaging** — messages are pushed to every connected client instantly over Socket.io (no polling, no refresh).
- **Persistent history** — messages are stored in MongoDB; `GET /api/messages` powers the initial load, so refreshing the browser never loses history.
- **Typing indicator** — "Rahul is typing…" appears live while another user types, and disappears when they stop (throttled + auto-expiring so the UI can never get stuck).
- **Online users** — avatar stack + live count, broadcast on every join/leave (supports multiple tabs per user).
- **Connection status** — Connected / Connecting / Disconnected pill in the header, plus a non-intrusive banner when the link drops. Socket.io's built-in reconnection kicks in automatically and refetches missed messages on reconnect.
- **Message status** — `sent` (single check) → `delivered` (double check) when at least one other user is online.
- **Clear all chat** — a header button wipes the whole conversation for everyone, with a confirmation prompt; a `chat_cleared` broadcast empties every connected client instantly.
- **Responsive UI** — desktop, tablet and mobile layouts in a single card-based view.
- **Robust error handling** — validation on both ends, central Express error middleware, 404 handler, and friendly in-UI error/notice states.

## Tech Stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | React 18, Vite, JavaScript (JSX), CSS, socket.io-client, Axios |
| Backend   | Node.js, Express 4, Socket.io 4, dotenv      |
| Database  | MongoDB with Mongoose 8                       |
| CORS      | `cors` middleware (frontend origin only)      |

## Project Structure

```
.
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── config/
│       │   └── db.js                  # Mongoose connection
│       ├── controllers/
│       │   └── messageController.js   # REST logic + validation
│       ├── middleware/
│       │   └── errorHandler.js        # 404 + central error handler
│       ├── models/
│       │   └── Message.js             # Mongoose message schema
│       ├── routes/
│       │   ├── messageRoutes.js       # /api/messages
│       │   └── healthRoutes.js        # /api/health
│       ├── sockets/
│       │   └── chatSocket.js          # ALL Socket.io event handling
│       ├── app.js                     # Express app (CORS, JSON, routes)
│       └── server.js                  # HTTP server + Socket.io bootstrap
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── .env.example
│   └── src/
│       ├── components/
│       │   ├── Header.jsx             # Brand, status pill, online users, logout
│       │   ├── ChatWindow.jsx         # Composes the chat card
│       │   ├── MessageList.jsx        # Scrollable list + auto-scroll + states
│       │   ├── MessageBubble.jsx      # Bubble, timestamp, sent/delivered icon
│       │   ├── MessageInput.jsx       # Input + send + typing emission
│       │   ├── TypingIndicator.jsx    # "X is typing…" with animated dots
│       │   └── OnlineUsers.jsx        # Avatar stack + live count
│       ├── pages/
│       │   ├── Login.jsx              # Username login screen
│       │   └── Chat.jsx               # History fetch + socket wiring
│       ├── services/
│       │   ├── api.js                 # Axios REST client
│       │   └── socket.js              # Socket.io singleton (auth + reconnect)
│       ├── utils/
│       │   └── format.js              # Time/id helpers
│       ├── App.jsx                    # Login <-> Chat switching (localStorage)
│       ├── main.jsx
│       └── index.css
└── README.md
```

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **MongoDB** — a local instance or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env     # then edit values if needed
npm run dev              # starts with nodemon (auto-reload)
# or: npm start          # plain node
```

The server listens on `http://localhost:5000` by default.

## Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env     # defaults already point at localhost:5000
npm run dev
```

Open `http://localhost:5173`, enter a username, and chat.
For production: `npm run build` then `npm run preview`.

## Environment Variables

### Backend (`backend/.env`)

| Variable       | Default                              | Description                          |
| -------------- | ------------------------------------ | ------------------------------------ |
| `PORT`         | `5000`                               | API + Socket.io port                 |
| `MONGODB_URI`  | `mongodb://127.0.0.1:27017/pulsechat`| MongoDB connection string            |
| `CLIENT_URL`   | `http://localhost:5173`              | Allowed frontend origin (CORS)       |

### Frontend (`frontend/.env`)

| Variable          | Default                 | Description                     |
| ----------------- | ----------------------- | ------------------------------- |
| `VITE_API_URL`    | `http://localhost:5000` | Base URL for REST calls         |
| `VITE_SOCKET_URL` | `http://localhost:5000` | URL for the Socket.io client    |

Never commit `.env` files — they are git-ignored.

## API Documentation

Base URL: `http://localhost:5000`

### GET `/api/health`

```bash
curl http://localhost:5000/api/health
```

```json
{ "success": true, "message": "Chat server is running" }
```

### GET `/api/messages`

Returns the latest messages sorted chronologically. Query param `limit` (1–100, default 100).

```bash
curl "http://localhost:5000/api/messages?limit=100"
```

```json
[
  {
    "_id": "66a0f1c2e3b4a5d6789012ab",
    "username": "Meet",
    "text": "Hello",
    "status": "delivered",
    "createdAt": "2025-01-15T10:24:31.000Z",
    "updatedAt": "2025-01-15T10:24:31.200Z"
  }
]
```

### POST `/api/messages`

```bash
curl -X POST http://localhost:5000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"username": "Meet", "text": "Hello"}'
```

```json
{
  "success": true,
  "message": {
    "_id": "66a0f1c2e3b4a5d6789012ac",
    "username": "Meet",
    "text": "Hello",
    "status": "sent",
    "createdAt": "2025-01-15T10:24:31.000Z"
  }
}
```

Validation (400 responses):

| Rule                          | Error                                      |
| ----------------------------- | ------------------------------------------ |
| `username` required, trimmed  | `"username is required"`                   |
| `username` ≤ 30 chars         | `"username must be at most 30 characters"` |
| `text` required, trimmed      | `"text is required and cannot be empty"`   |
| `text` ≤ 1000 chars           | `"text must be at most 1000 characters"`   |
| Malformed JSON body           | `"Invalid JSON body"`                      |

### DELETE `/api/messages`

Clears the **entire** chat (every message, for every user) and broadcasts `chat_cleared` to all connected sockets.

```bash
curl -X DELETE http://localhost:5000/api/messages
```

```json
{ "success": true }
```

### DELETE `/api/messages/:id` *(optional)*

```bash
curl -X DELETE http://localhost:5000/api/messages/66a0f1c2e3b4a5d6789012ab
```

```json
{ "success": true }
```

## Socket.io Events

Client connects with `io(SOCKET_URL, { auth: { username } })`.

### Client → Server

| Event           | Payload            | Description                                   |
| --------------- | ------------------ | --------------------------------------------- |
| `send_message`  | `{ text }`         | Validate → persist → broadcast to everyone    |
| `typing`        | —                  | Relay "X is typing" to all other clients      |
| `stop_typing`   | —                  | Clear "X is typing" on all other clients      |

### Server → Client

| Event             | Payload                          | Description                                        |
| ----------------- | -------------------------------- | -------------------------------------------------- |
| `receive_message` | full saved message document      | Emits to **all** clients (sender included)         |
| `online_users`    | `["Meet", "Rahul"]`              | Broadcast on connect/disconnect                    |
| `chat_cleared`    | —                                | The whole chat was cleared — empty the message list |
| `typing`          | `{ username }`                   | Someone else started typing                        |
| `stop_typing`     | `{ username }`                   | Someone else stopped typing                        |
| `message_error`   | `{ message }`                    | Validation/persistence failure for that socket     |

### Lifecycle

- `connection` — server tracks the username (from the handshake auth) in an in-memory map and broadcasts `online_users`.
- `disconnect` — server removes the socket; when a user's last socket leaves, the name is removed and `online_users` is rebroadcast.
- Typing events are **never** written to MongoDB.

### Send flow

1. Frontend emits `send_message`
2. Backend validates the payload
3. Backend stores the message in MongoDB
4. Backend marks it `delivered` if other users are online
5. Backend broadcasts `receive_message` to all connected clients
6. Sender and everyone else see it instantly — no refresh, no polling

## Design Decisions

- **Why React?** Component model maps naturally to a chat UI (bubbles, input, indicators). Vite makes the dev loop near-instant, and plain CSS keeps the dependency tree minimal.
- **Why Express?** Small, battle-tested, easy to reason about — the right size for an API this scope. Clean separation: routes → controllers → models, plus one dedicated Socket.io module.
- **Why Socket.io?** The assignment's core requirement: bidirectional push over a persistent connection with automatic reconnection, fallback transports and rooms-style broadcasting out of the box — exactly what a chat needs.
- **Why MongoDB?** Flexible document store that's trivial to stand up for free (Atlas), pairs naturally with Mongoose validation, and stores the whole message as one document.
- **Why REST + Socket.io together?** REST is stateless and request/response — perfect for *loading history* and for a *fallback* send path when the socket is down. Socket.io handles *everything live*. Each transport does what it's best at.

## Assumptions

- **Dummy username login** — no real authentication by design.
- **No production authentication** — anyone can join with any name (assignment scope).
- **Single global chat room** — one room for all users; no per-user threads.
- **MongoDB used for persistence** — only messages are stored; typing and presence are in-memory.
- **Socket.io used exclusively for realtime** — there is no polling anywhere in the app.

## Troubleshooting

- **MongoDB connection failure** — `❌ MongoDB connection failed` on startup means MongoDB isn't running or `MONGODB_URI` is wrong. Locally: `mongod` (or your OS service). Atlas: check the URI, IP allow-list and database name.
- **CORS errors in the browser console** — your frontend origin doesn't match `CLIENT_URL`. Set `CLIENT_URL` (backend) to the exact origin you run the frontend on, including port, and restart the backend.
- **Port already in use** — `EADDRINUSE` means something else is on port 5000/5173. Change `PORT` / Vite's `server.port`, and update `CLIENT_URL` + `VITE_API_URL`/`VITE_SOCKET_URL` to match.
- **Socket.io connection failure (UI stuck on "Connecting")** — confirm the backend is up (`GET /api/health`), that `VITE_SOCKET_URL` points at the backend origin, and that `CLIENT_URL` allows your frontend origin. Check that the `/socket.io/` requests show up in the browser Network tab.
- **Messages appear but not live** — the REST load works but the socket doesn't: 99% of the time this is the CORS/origin mismatch above.

## Deployment

### Backend → Render

1. Push the repo to GitHub.
2. Render → **New → Web Service** → pick the repo → **Root Directory: `backend`**.
3. Build command: `npm install` · Start command: `npm start`.
4. Add env vars: `PORT` (Render injects it), `MONGODB_URI` (MongoDB Atlas URI), `CLIENT_URL` (your deployed frontend URL, e.g. `https://pulsechat.vercel.app`).
5. Deploy, then verify `https://<backend>.onrender.com/api/health`.

### Frontend → Vercel

1. Vercel → **New Project** → import the repo → **Root Directory: `frontend`**.
2. Framework preset: **Vite** (detected automatically).
3. Add env vars: `VITE_API_URL` and `VITE_SOCKET_URL` = your backend's public URL (e.g. `https://<backend>.onrender.com`).
4. Deploy.

> Free Render tiers sleep after inactivity; the first request after a sleep takes a few seconds. The UI's "Connecting" state and auto-reconnect handle this gracefully.

---

## Sandbox demo (repository root)

This repository also contains a **runnable demo** at the root (Next.js + Drizzle + PostgreSQL with a server-sent-events realtime channel) so the project can be previewed in environments without MongoDB. It reproduces the full user flow (login → realtime chat → typing → online users → persistent history). **The submit-able implementation is `backend/` + `frontend/`** (Socket.io + MongoDB) — this root demo is only a convenience preview.

Run it:

```bash
npm install
npm run dev        # or: npm run build && npm start
```

---

## Testing Checklist (do this once locally)

1. Start MongoDB, then `cd backend && npm run dev`, then `cd frontend && npm run dev`.
2. Open the app, log in as **Meet**.
3. Open a second window (incognito), log in as **Rahul**.
4. Meet sends "Hello" → Rahul sees it **instantly**, no refresh. Meet still has it.
5. Refresh Rahul's browser → "Hello" is still there (loaded from MongoDB).
6. Rahul starts typing → Meet sees **"Rahul is typing…"** with animated dots.
7. Rahul stops typing (or waits ~3s) → the indicator disappears.
8. Close Rahul's window → Meet's online count drops to 1.
9. Reopen Rahul → reconnects automatically (status pill: Connecting → Connected), online count is 2 again.
10. Watch your own messages show ✓ (sent) or ✓✓ (delivered) in the header of your bubbles.

## Git — push to GitHub

```bash
git init                    # if not already a repo
git add .
git commit -m "PulseChat: real-time chat with Express, Socket.io and MongoDB"
git branch -M main
git remote add origin https://github.com/<your-username>/pulsechat.git
git push -u origin main
```

## Final Submission Checklist

- [ ] `backend/` and `frontend/` both run with the commands above
- [ ] `.env` files created from `.env.example` (and **not** committed)
- [ ] `node_modules`, `.env`, `dist`, `.vite`, `*.log` are git-ignored
- [ ] `GET /api/health` returns the success JSON
- [ ] Realtime flow verified with two browser windows (checklist above)
- [ ] Typing indicator appears and disappears
- [ ] Online count updates on join/leave
- [ ] Refresh preserves history
- [ ] Screen recording of the two-user demo flow
