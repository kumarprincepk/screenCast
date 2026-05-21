const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT || 4174);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const uploadDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

function sendJson(response, status, body) {
    response.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-File-Name",
    });
    response.end(JSON.stringify(body));
}

function safeFileName(fileName) {
    return path.basename(fileName || "screen-cast.webm").replace(/[^a-z0-9._-]/gi, "-");
}

const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return;
    }

    if (request.method === "POST" && request.url === "/upload") {
        const id = crypto.randomUUID();
        const fileName = `${id}-${safeFileName(request.headers["x-file-name"])}`;
        const targetPath = path.join(uploadDir, fileName);
        const writeStream = fs.createWriteStream(targetPath);

        request.pipe(writeStream);

        request.on("error", () => {
            writeStream.destroy();
            sendJson(response, 500, { error: "Upload stream failed." });
        });

        writeStream.on("error", () => {
            sendJson(response, 500, { error: "Could not save uploaded file." });
        });

        writeStream.on("finish", () => {
            const url = `${publicBaseUrl}/videos/${encodeURIComponent(fileName)}`;
            sendJson(response, 200, {
                url,
                embedCode: `<video controls preload="metadata" width="960" src="${url}"></video>`,
            });
        });

        return;
    }

    if (request.method === "GET" && request.url.startsWith("/videos/")) {
        const fileName = decodeURIComponent(request.url.replace("/videos/", ""));
        const targetPath = path.join(uploadDir, path.basename(fileName));

        if (!fs.existsSync(targetPath)) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }

        response.writeHead(200, {
            "Content-Type": "video/webm",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(targetPath).pipe(response);
        return;
    }

    response.writeHead(404);
    response.end("Not found");
});

server.listen(port, () => {
    console.log(`Share server running at ${publicBaseUrl}`);
    console.log(`Upload endpoint: ${publicBaseUrl}/upload`);
});
