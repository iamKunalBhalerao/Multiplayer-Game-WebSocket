import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 8080 });

interface Player {
  userId: string;
  socket: WebSocket;
  x: number;
  y: number;
  input: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  lastInputSequence: number;

  inputCount: number;
  lastInputReset: number;
}

interface GameRoom {
  id: string;
  players: Map<string, Player>;
}

interface UserSession {
  userId: string | null;
  socket: WebSocket | null;
  roomId: string | null;
  disconnectTimer?: NodeJS.Timeout;
}

const users = new Map<string, UserSession>();
const rooms = new Map<string, GameRoom>();

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "WELCOME", message: "Connect to WS" }));
  let currentUser: string | null = null;

  socket.on("message", (data) => {
    const message = data.toString();
    let parsedData;
    try {
      parsedData = JSON.parse(message);
      if (typeof parsedData === "object" && parsedData !== null) {
        // ALl Logic here
        if (parsedData.type === "IDENTIFY") {
          if (!parsedData.userId)
            return socket.send(
              JSON.stringify({ type: "ERROR", message: "userId is required" }),
            );

          if (currentUser)
            return socket.send(
              JSON.stringify({ type: "ERROR", message: "Already identified" }),
            );

          const existingUser = users.get(parsedData.userId);

          if (existingUser) {
            // Reconnecting user
            if (existingUser.socket !== null)
              return socket.send(
                JSON.stringify({
                  type: "ERROR",
                  message: "Already identified",
                }),
              );

            if (existingUser.disconnectTimer) {
              clearTimeout(existingUser.disconnectTimer);
              existingUser.disconnectTimer = undefined;
            }

            existingUser.socket = socket;
            currentUser = parsedData.userId;

            socket.send(
              JSON.stringify({
                type: "IDENTIFIED",
                userId: parsedData.userId,
                reconnect: true,
              }),
            );

            return;
          }

          const session: UserSession = {
            userId: parsedData.userId,
            socket,
            roomId: null,
          };
          users.set(currentUser!, session);
          socket.send(
            JSON.stringify({
              type: "IDENTIFIED",
              userId: currentUser,
              reconnect: false,
            }),
          );
        }

        if (parsedData.type === "CREATE_ROOM") {
          const { roomId } = parsedData;

          if (!currentUser)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "User not IDENTIFIED",
              }),
            );

          if (!roomId)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "RoomId is required",
              }),
            );

          const room = rooms.get(roomId);
          if (room)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "Room Already Exists!",
              }),
            );

          rooms.set(roomId, {
            id: roomId,
            players: new Map(),
          });

          socket.send(
            JSON.stringify({
              type: "ROOM_CREATED",
              roomId,
              message: "Room Created",
            }),
          );
        }

        if (parsedData.type === "JOIN_ROOM") {
          const { roomId } = parsedData;

          if (!currentUser)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "User not IDENTIFIED",
              }),
            );

          if (!roomId)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "RoomId is required",
              }),
            );

          const session = users.get(currentUser);

          if (!session)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "Session Not Found!",
              }),
            );

          const room = rooms.get(roomId);
          if (!room)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "Room Not Exists!",
              }),
            );

          room.players.set(currentUser, {
            userId: currentUser,
            socket: socket,
            x: 0,
            y: 0,
            input: {
              up: false,
              down: false,
              left: false,
              right: false,
            },
            lastInputSequence: 0,
            inputCount: 0,
            lastInputReset: Date.now(),
          });

          if (session.roomId) {
            const oldRoom = rooms.get(session.roomId);

            oldRoom?.players.delete(currentUser);

            if (oldRoom?.players.size === 0) {
              rooms.delete(session.roomId);
            }
          }

          session.roomId = roomId;

          room.players.forEach((p) => {
            if (p.socket !== socket && p.socket.readyState === WebSocket.OPEN) {
              p.socket.send(
                JSON.stringify({
                  type: "PLAYER_JOINED",
                  userId: currentUser,
                  roomId,
                }),
              );
            }
          });

          socket.send(
            JSON.stringify({
              type: "ROOM_JOINED",
              roomId,
              message: "Joined room successfully",
            }),
          );
        }

        if (parsedData.type === "PLAYER_INPUT") {
          const now = Date.now();
          const { roomId, keys, sequence } = parsedData;

          if (!currentUser)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "User not IDENTIFIED",
              }),
            );

          if (!roomId)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "RoomId is required",
              }),
            );

          if (
            typeof keys !== "object" ||
            typeof keys.right !== "boolean" ||
            typeof keys.left !== "boolean" ||
            typeof keys.up !== "boolean" ||
            typeof keys.down !== "boolean"
          )
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "INVALID_INPUT",
              }),
            );

          const room = rooms.get(roomId);
          if (!room)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "Room Not Exists!",
              }),
            );

          const player = room.players.get(currentUser);
          if (!player)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "Player not in room",
              }),
            );

          // Rate limiting logic
          if (now - player.lastInputReset >= 1000) {
            player.inputCount = 0;
            player.lastInputReset = now;
          }

          player.inputCount++;

          if (player.inputCount > 60)
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "RATE_LIMITED",
              }),
            );

          // sequence check
          if (sequence <= player.lastInputSequence) {
            return;
          }
          if (sequence <= player.lastInputSequence) return;

          player.lastInputSequence = sequence;
          player.input = keys;
        }
      } else
        socket.send(
          "Not received a valid JSON object: " + JSON.stringify(parsedData),
        );
    } catch (e) {
      socket.send("Received simple string: " + message);
    }
  });
  socket.on("close", () => {
    if (!currentUser) return;
    const session = users.get(currentUser);
    if (!session) return;

    session.socket = null;

    session.disconnectTimer = setTimeout(() => {
      const currentSession = users.get(currentUser!);

      // User didn't reconnect
      if (currentSession?.socket === null) {
        users.delete(currentUser!);

        // Also remove from room
        if (currentSession.roomId) {
          const room = rooms.get(currentSession.roomId);

          room?.players.delete(currentUser!);

          if (room?.players.size === 0) {
            rooms.delete(currentSession.roomId);
          }
        }
      }
    }, 30_000);
  });
});

const TICK_RATE = 1000 / 60;
let lastTime = Date.now();

setInterval(() => {
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  for (const room of rooms.values()) {
    updateRoom(room, deltaTime);
  }
}, TICK_RATE);

function updateRoom(room: GameRoom, deltaTime: number) {
  const speed = 250;

  for (const player of room.players.values()) {
    if (player.input.up) player.y -= speed * deltaTime;
    if (player.input.down) player.y += speed * deltaTime;
    if (player.input.left) player.x -= speed * deltaTime;
    if (player.input.right) player.x += speed * deltaTime;
  }
}

setInterval(() => {
  for (const room of rooms.values()) {
    broadcastGameState(room);
  }
}, 50);

function broadcastGameState(room: GameRoom) {
  for (const player of room.players.values()) {
    player.socket.send(
      JSON.stringify({
        type: "GAME_STATE",
        lastProcessedInput: player.lastInputSequence,
        players: [...room.players.values()].map((player) => ({
          id: player.userId,
          x: player.x,
          y: player.y,
        })),
      }),
    );
  }
}
