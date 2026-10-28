import asyncio
import json
from typing import Literal

import anthropic
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Body, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


DATA_ID = "main"


# ponytail: toutes les données de l'app dans un seul document (≈1 Mo pour 7 ans) ;
# à découper en collections si on approche la limite de 16 Mo d'un document Mongo.
@api_router.get("/data")
async def get_data():
    doc = await db.app_data.find_one({"_id": DATA_ID}, {"_id": 0})
    if doc is None:
        raise HTTPException(404, "Aucune donnée enregistrée")
    return doc


@api_router.put("/data", status_code=204)
async def put_data(data: dict = Body(...)):
    await db.app_data.replace_one({"_id": DATA_ID}, data, upsert=True)


RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "amount": {"type": ["number", "null"], "description": "Total payé TTC, positif, en euros"},
        "date": {"type": ["string", "null"], "description": "Date du ticket au format YYYY-MM-DD"},
        "merchant": {"type": ["string", "null"], "description": "Nom de l'enseigne"},
    },
    "required": ["amount", "date", "merchant"],
    "additionalProperties": False,
}


class Receipt(BaseModel):
    image: str = Field(max_length=10_000_000)  # base64, ~7 Mo d'image
    media_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]


@api_router.post("/receipt")
async def read_receipt(r: Receipt):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(503, "Ajoute ANTHROPIC_API_KEY dans backend/.env pour lire les tickets")
    try:
        msg = await anthropic.AsyncAnthropic().beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=1024,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": RECEIPT_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": r.media_type, "data": r.image}},
                {"type": "text", "text": "Ticket de caisse photographié. Donne le total payé, la date et l'enseigne. Null si illisible."},
            ]}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(503, "Clé ANTHROPIC_API_KEY invalide dans backend/.env")
    except anthropic.APIError as e:
        raise HTTPException(502, f"Lecture IA impossible : {e}")
    if msg.stop_reason == "refusal":
        raise HTTPException(422, "Ticket refusé par le modèle")
    text = next((b.text for b in msg.content if b.type == "text"), "{}")
    return json.loads(text)


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
