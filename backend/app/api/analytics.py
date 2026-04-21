from fastapi import APIRouter, Query
from services.analytics import compute_overview

router = APIRouter()

@router.get("/analytics/overview")
def get_analytics_overview(prefer_cpp: bool = Query(True)):
    data = compute_overview(prefer_cpp=prefer_cpp)
    return data
