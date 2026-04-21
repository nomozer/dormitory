from typing import Any, Dict
from fastapi import APIRouter, Query, Request, HTTPException, Depends, Header
from core.config import DEFAULT_DATASET_LIMIT, MAX_DATASET_LIMIT, API_KEY
from services.storage import list_datasets as storage_list_datasets, read_rows, append_row

router = APIRouter()

def verify_api_key(x_api_key: str | None = Header(None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

@router.get("/datasets")
def get_datasets():
    return {"ok": True, "items": storage_list_datasets()}

@router.get("/datasets/{dataset_name}")
def get_dataset_rows(dataset_name: str, limit: int = Query(DEFAULT_DATASET_LIMIT, le=MAX_DATASET_LIMIT, ge=1)):
    try:
        rows = read_rows(dataset_name, limit=limit)
        return {"ok": True, "dataset": dataset_name, "rows": rows}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset_name}")

@router.post("/datasets/{dataset_name}/append", status_code=201)
async def append_dataset_row(dataset_name: str, request: Request, authorized: bool = Depends(verify_api_key)):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    try:
        row = append_row(dataset_name, body)
        return {"ok": True, "dataset": dataset_name, "row": row}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset_name}")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
