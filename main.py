from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Item(BaseModel):
    name: str
    description: str = None
    price: float

@app.get("/")
async def root():
    return {"message": "Welcome to FastAPI + React"}

@app.get("/api/items")
async def get_items():
    return [
        {"id": 1, "name": "Item 1", "description": "First item", "price": 10.99},
        {"id": 2, "name": "Item 2", "description": "Second item", "price": 20.99},
    ]

@app.post("/api/items")
async def create_item(item: Item):
    return {"id": 3, **item.dict()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)