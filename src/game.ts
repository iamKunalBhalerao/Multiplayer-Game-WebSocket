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
}

interface GameRoom {
  id: string;
  players: Map<string, Player>;
}

const users = new Map<string, WebSocket>();
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
          if (users.has(parsedData.userId))
            return socket.send(
              JSON.stringify({
                type: "ERROR",
                message: "User ID already in use",
              }),
            );
          currentUser = parsedData.userId;
          users.set(currentUser!, socket);
          socket.send(
            JSON.stringify({ type: "IDENTIFIED", userId: currentUser }),
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
          });

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
          const { roomId } = parsedData;
          const { up, down, left, right } = parsedData.keys;

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

          player.input = { up, down, left, right };

          // room.players.forEach((p) => {
          //   if (p.socket !== socket && p.socket.readyState === WebSocket.OPEN) {
          //     p.socket.send(
          //       JSON.stringify({
          //         type: "PLAYER_INPUT",
          //         userId: currentUser,
          //         roomId,
          //         input: { up, down, left, right },
          //       }),
          //     );
          //   }
          // });
        }

        //
        //
        //
        //
        //
        //
      } else
        socket.send(
          "Not received a valid JSON object: " + JSON.stringify(parsedData),
        );
    } catch (e) {
      socket.send("Received simple string: " + message);
    }
  });
});

const TICK_RATE = 50;

setInterval(() => {
  for (const room of rooms.values()) {
    updateRoom(room);
  }
}, TICK_RATE);

function updateRoom(room: GameRoom) {
  for (const player of room.players.values()) {
    const speed = 5;

    if (player.input.up) player.y -= speed;
    if (player.input.down) player.y += speed;
    if (player.input.left) player.x -= speed;
    if (player.input.right) player.x += speed;
  }

  const state = JSON.stringify({
    type: "GAME_STATE",
    players: [...room.players.values()].map((player) => ({
      id: player.userId,
      x: player.x,
      y: player.y,
    })),
  });

  for (const player of room.players.values()) {
    player.socket.send(state);
  }
}
