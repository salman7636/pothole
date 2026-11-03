from pathlib import Path
import gc

import cv2
from ultralytics import YOLO


class PotholeDetector:
    def __init__(self, model_path: str = "models/best.pt"):
        self.model_path = Path(model_path)
        self.model = None

    def load_model(self):
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Pothole model not found: {self.model_path}"
            )

        self.model = YOLO(str(self.model_path))

        return self.model

    def detect(self, image_path: str):
        """
        Memory-efficient pothole detection for a single image.
        """

        if self.model is None:
            self.load_model()

        results = self.model.predict(
            source=image_path,
            conf=0.25,
            imgsz=416,
            max_det=50,
            device="cpu",
            stream=True,
            verbose=False,
        )

        detections = []

        for result in results:

            if result.boxes is None:
                continue

            for box in result.boxes:

                confidence = float(box.conf[0])
                class_id = int(box.cls[0])

                x1, y1, x2, y2 = box.xyxy[0].tolist()

                detections.append(
                    {
                        "class_id": class_id,
                        "confidence": round(confidence, 4),
                        "bounding_box": {
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "x2": round(x2, 2),
                            "y2": round(y2, 2),
                        },
                    }
                )

            del result

        gc.collect()

        return detections

    def detect_video(
        self,
        video_path: str,
        output_path: str = "uploads/videos/annotated_output.mp4",
    ):
        """
        Memory-efficient YOLO + ByteTrack video detection.
        """

        if self.model is None:
            self.load_model()

        video = cv2.VideoCapture(video_path)

        if not video.isOpened():
            raise ValueError(
                f"Unable to open video: {video_path}"
            )

        fps = video.get(cv2.CAP_PROP_FPS)
        original_width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
        original_height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))

        if fps <= 0:
            fps = 30.0

        # -----------------------------------------
        # Limit resolution to reduce Render RAM use
        # -----------------------------------------

        max_dimension = 1280

        scale = min(
            1.0,
            max_dimension / max(original_width, original_height),
        )

        width = int(original_width * scale)
        height = int(original_height * scale)

        if width <= 0 or height <= 0:
            video.release()
            raise ValueError("Invalid video dimensions")

        output_file = Path(output_path)

        output_file.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        fourcc = cv2.VideoWriter_fourcc(
            *"mp4v"
        )

        writer = cv2.VideoWriter(
            str(output_file),
            fourcc,
            fps,
            (width, height),
        )

        if not writer.isOpened():
            video.release()
            raise ValueError(
                f"Unable to create output video: {output_file}"
            )

        tracked_potholes = {}

        frame_number = 0
        processed_frames = 0

        try:

            while True:

                success, frame = video.read()

                if not success:
                    break

                frame_number += 1

                # -----------------------------------------
                # Resize large frames to save memory
                # -----------------------------------------

                if scale < 1.0:

                    frame = cv2.resize(
                        frame,
                        (width, height),
                        interpolation=cv2.INTER_AREA,
                    )

                processed_frames += 1

                # -----------------------------------------
                # YOLO + ByteTrack
                # -----------------------------------------

                results = self.model.track(
                    source=frame,
                    conf=0.25,
                    imgsz=416,
                    max_det=30,
                    device="cpu",
                    persist=True,
                    tracker="bytetrack.yaml",
                    verbose=False,
                )

                if not results:
                    writer.write(frame)

                    del frame
                    gc.collect()

                    continue

                result = results[0]

                # -----------------------------------------
                # Store best detection for each track
                # -----------------------------------------

                if result.boxes is not None:

                    for box in result.boxes:

                        confidence = float(box.conf[0])
                        class_id = int(box.cls[0])

                        x1, y1, x2, y2 = box.xyxy[0].tolist()

                        track_id = None

                        if box.id is not None:
                            track_id = int(box.id[0])

                        if track_id is not None:
                            unique_id = f"track_{track_id}"
                        else:
                            unique_id = (
                                f"frame_{frame_number}_"
                                f"{len(tracked_potholes)}"
                            )

                        detection = {
                            "track_id": track_id,
                            "class_id": class_id,
                            "confidence": round(
                                confidence,
                                4,
                            ),
                            "frame": frame_number,
                            "bounding_box": {
                                "x1": round(x1, 2),
                                "y1": round(y1, 2),
                                "x2": round(x2, 2),
                                "y2": round(y2, 2),
                            },
                        }

                        previous = tracked_potholes.get(
                            unique_id
                        )

                        if (
                            previous is None
                            or confidence
                            > previous["confidence"]
                        ):
                            tracked_potholes[
                                unique_id
                            ] = detection

                # -----------------------------------------
                # Draw detections
                # -----------------------------------------

                annotated_frame = result.plot()

                writer.write(annotated_frame)

                # -----------------------------------------
                # Explicitly release frame memory
                # -----------------------------------------

                del annotated_frame
                del result
                del results
                del frame

                # Garbage collection periodically
                if processed_frames % 10 == 0:
                    gc.collect()

        finally:

            video.release()
            writer.release()

            gc.collect()

        return {
            "total_frames": total_frames,
            "processed_frames": processed_frames,
            "unique_potholes": len(
                tracked_potholes
            ),
            "detections": list(
                tracked_potholes.values()
            ),
            "output_video": str(output_file),
        }