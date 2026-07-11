from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_user
from app.schemas import MediaUploadResponse
from app.services.storage_service import StorageService

router = APIRouter(prefix="/api/media", tags=["media"])


@router.post("/audio", response_model=MediaUploadResponse, status_code=201)
async def upload_audio(
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    storage = StorageService()
    path = await storage.save_audio(file)
    return MediaUploadResponse(file_path=path)


@router.post("/video", response_model=MediaUploadResponse, status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    storage = StorageService()
    path = await storage.save_video(file)
    return MediaUploadResponse(file_path=path)
