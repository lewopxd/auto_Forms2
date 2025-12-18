"""
FastAPI Server - Professional WebSocket communication
Serves test UI and handles bidirectional communication
"""
import sys
import os
from pathlib import Path
from contextlib import asynccontextmanager
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from server.protocol.message import Message, MessageType
from server.protocol.queue import MessageQueue
from server.logger import hybrid_logger
from server.handlers.data_handlers import DataHandlers

# Directories
WEB_DIR = PROJECT_ROOT / "web"
PLAYGROUND_DIR = PROJECT_ROOT / "sheetPlayground"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Configure logger from settings
    try:
        from config.settings import LOGGING
        hybrid_logger.configure(
            console_level=LOGGING.get("console_level", "INFO"),
            ui_level=LOGGING.get("ui_level", "INFO"),
            queue_for_ui=LOGGING.get("queue_for_ui", True),
            max_queue=LOGGING.get("max_queue_size", 100)
        )
    except ImportError:
        pass
    
    await hybrid_logger.info("server", "🚀 Server starting...")
    yield
    await hybrid_logger.info("server", "👋 Server shutting down...")


app = FastAPI(
    title="MS Forms Automation",
    description="Professional WebSocket communication for form automation",
    version="1.0.0",
    lifespan=lifespan
)


# ========== REST API Routes ==========

from server.routes import projects_router, excel_router
app.include_router(projects_router)
app.include_router(excel_router)


# ========== Static Files ==========

# Mount web directory for test UI
if WEB_DIR.exists():
    app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")

# Mount playground directories
if PLAYGROUND_DIR.exists():
    if (PLAYGROUND_DIR / "css").exists():
        app.mount("/css", StaticFiles(directory=PLAYGROUND_DIR / "css"), name="css")
    if (PLAYGROUND_DIR / "js").exists():
        app.mount("/js", StaticFiles(directory=PLAYGROUND_DIR / "js"), name="js")


# ========== Routes ==========

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the main playground UI."""
    # Serve playground by default
    playground_html = PLAYGROUND_DIR / "index.html"
    if playground_html.exists():
        return FileResponse(playground_html)
    
    # Fallback to test UI
    test_html = WEB_DIR / "test.html"
    if test_html.exists():
        return FileResponse(test_html)
    
    # Ultimate fallback - inline test page
    return HTMLResponse("""
    <!DOCTYPE html>
    <html>
    <head><title>Server Running</title></head>
    <body>
        <h1>✅ Server is running</h1>
        <p>No index.html found.</p>
    </body>
    </html>
    """)


@app.get("/test")
async def serve_test():
    """Serve the WebSocket test UI."""
    test_html = WEB_DIR / "test.html"
    if test_html.exists():
        return FileResponse(test_html)
    raise HTTPException(404, "Test UI not found")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "message": "Server is running"}


# ========== WebSocket: Data Channel ==========

@app.websocket("/ws/data")
async def data_channel(websocket: WebSocket):
    """
    Main data channel - Application data with ACK protocol.
    """
    await websocket.accept()
    
    # Create message queue for this connection
    async def send_func(data: str):
        await websocket.send_text(data)
    
    queue = MessageQueue(send_func)
    await queue.start()
    handlers = DataHandlers(queue)
    
    # Send connection confirmation
    await queue.send(Message(
        type=MessageType.CONNECTED.value,
        data={"channel": "data", "message": "Data channel established"}
    ))
    
    await hybrid_logger.info("server", "📡 Data channel connected")
    
    try:
        while True:
            raw = await websocket.receive_text()
            
            try:
                data = json.loads(raw)
                msg = Message.from_dict(data)
            except json.JSONDecodeError as e:
                await hybrid_logger.warning("server", f"Invalid JSON received: {e}")
                continue
            
            # Handle ACK/NACK
            if msg.type in (MessageType.ACK.value, MessageType.NACK.value):
                await queue.acknowledge(
                    msg.reply_to,
                    success=(msg.type == MessageType.ACK.value),
                    response=msg
                )
                continue
            
            # Send immediate ACK for messages that require it
            if msg.requires_ack():
                ack = Message.ack(msg.id)
                await websocket.send_text(ack.to_json())
            
            # Handle message and send response
            response = await handlers.handle(msg)
            if response:
                await queue.send(response)
                
    except WebSocketDisconnect:
        await hybrid_logger.info("server", "📡 Data channel disconnected")
    except Exception as e:
        await hybrid_logger.error("server", f"Data channel error: {e}")
    finally:
        await queue.stop()


# ========== WebSocket: Log Channel ==========

@app.websocket("/ws/logs")
async def log_channel(websocket: WebSocket):
    """
    Log channel - Streaming logs to UI.
    """
    await websocket.accept()
    
    # Send connection confirmation
    await websocket.send_json(Message(
        type=MessageType.CONNECTED.value,
        data={"channel": "logs", "message": "Log channel established"}
    ).to_dict())
    
    # Subscribe to logs
    hybrid_logger.subscribe(websocket)
    await hybrid_logger.info("server", "📋 Log channel connected and subscribed")
    
    try:
        while True:
            # Keep connection alive, handle control messages
            raw = await websocket.receive_text()
            
            try:
                data = json.loads(raw)
                msg = Message.from_dict(data)
                
                if msg.type == MessageType.UNSUBSCRIBE.value:
                    hybrid_logger.unsubscribe(websocket)
                    await websocket.send_text(Message.ack(msg.id).to_json())
                    break
                    
            except json.JSONDecodeError:
                continue
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await hybrid_logger.error("server", f"Log channel error: {e}")
    finally:
        hybrid_logger.unsubscribe(websocket)
        await hybrid_logger.info("server", "📋 Log channel disconnected")


# ========== Run directly (for testing) ==========

if __name__ == "__main__":
    import uvicorn
    
    # Get port from settings or default
    port = 8000
    try:
        from config.settings import SERVER
        port = SERVER.get("port", 8000)
    except ImportError:
        pass
    
    print(f"🚀 Starting server on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
