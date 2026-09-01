from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, UploadFile, HTTPException
from ultralytics import YOLO

from app.config import MODEL_PATH as CONFIGURED_MODEL_PATH


router = APIRouter(
    prefix="/ai",
    tags=["AI Detection"]
)


MODEL_PATH = Path(CONFIGURED_MODEL_PATH)

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"YOLO model not found: {MODEL_PATH}"
    )

model = YOLO(str(MODEL_PATH))


@router.post("/detect")
async def detect_potholes(
    file: UploadFile = File(...)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an image file."
        )

    image_bytes = await file.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty."
        )

    image = cv2.imdecode(
        np.frombuffer(image_bytes, dtype=np.uint8),
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid image."
        )

    results = model.predict(
        source=image,
        conf=0.25,
        imgsz=640,
        verbose=False
    )

    detections = []

    for result in results:
        if result.boxes is None:
            continue

        for box in result.boxes:
            coordinates = box.xyxy[0].tolist()

            confidence = float(box.conf[0])

            class_id = int(box.cls[0])

            class_name = model.names[class_id]

            detections.append({
                "class": class_name,
                "confidence": round(confidence, 4),
                "bbox": {
                    "x1": round(coordinates[0], 2),
                    "y1": round(coordinates[1], 2),
                    "x2": round(coordinates[2], 2),
                    "y2": round(coordinates[3], 2)
                }
            })

    return {
        "filename": file.filename,
        "detections_count": len(detections),
        "detections": detections
    }
