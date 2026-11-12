"""PaddleOCR worker for scripts/serve.mjs (POST /api/ocr). Install once: pip install paddlepaddle paddleocr

  python scripts/ocr.py --check   exits 0 and prints "ok" if paddleocr can be imported
  python scripts/ocr.py           reads one image path per line on stdin and prints, per image, one line
                                  TANAW {"width", "height", "words": [{"str", "x", "y", "w", "h", "conf"}]}
                                  (pixels; x = left edge, y = vertical centre) or TANAW {"error": "..."}
"""
import json
import os
import sys

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")  # PaddleOCR 3: skip the slow model-host check at start
SIDE = 2400  # longest side sent to the detector: a full bill page at the default 960 px loses the small print


def engine():
    import paddleocr
    from paddleocr import PaddleOCR

    v3 = int(paddleocr.__version__.split(".")[0]) >= 3
    if v3:
        # enable_mkldnn=False: paddlepaddle 3.3 on CPU fails with "ConvertPirAttribute2RuntimeAttribute not support" when oneDNN is on.
        # Mobile models by default: the full-size ones took about 2 minutes a page on a laptop CPU. OCR_MODELS=server uses them
        # anyway (worth it only with paddlepaddle-gpu).
        # Measured on an old laptop CPU, one bill page: mobile models 25 s, full-size models 130 s. Both read the amounts right;
        # both sometimes drop spaces between tracker numbers (www/lib/ocr.js puts them back).
        models = {"lang": "en"} if os.environ.get("OCR_MODELS") == "server" else {
            "text_detection_model_name": "PP-OCRv5_mobile_det", "text_recognition_model_name": "PP-OCRv5_mobile_rec"}
        return v3, PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, enable_mkldnn=False,
                             use_textline_orientation=False, text_det_limit_side_len=SIDE, text_det_limit_type="max", **models)
    return v3, PaddleOCR(lang="en", use_angle_cls=False, det_limit_side_len=SIDE, det_limit_type="max", show_log=False)


def read(v3, ocr, path):
    import numpy as np
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")  # phone photos are stored sideways with an EXIF flag
    img.thumbnail((SIDE, SIDE))
    bgr = np.ascontiguousarray(np.array(img)[:, :, ::-1])
    if v3:
        r = ocr.predict(bgr)[0]
        found = zip(r["rec_polys"], r["rec_texts"], r["rec_scores"])
    else:
        found = ((box, text, score) for box, (text, score) in (ocr.ocr(bgr, cls=False)[0] or []))
    words = []
    for box, text, score in found:
        xs, ys = [float(p[0]) for p in box], [float(p[1]) for p in box]
        words.append({"str": text, "x": min(xs), "y": (min(ys) + max(ys)) / 2, "w": max(xs) - min(xs), "h": max(ys) - min(ys),
                      "conf": round(float(score), 3)})
    return {"width": img.width, "height": img.height, "words": words}


def main():
    if "--check" in sys.argv:
        import paddleocr  # noqa: F401
        print("ok")
        return
    v3, ocr = engine()
    for line in sys.stdin:
        path = line.strip()
        if not path:
            continue
        try:
            out = read(v3, ocr, path)
        except Exception as e:  # one bad photo must not stop the worker
            out = {"error": f"could not read the photo ({type(e).__name__}: {e})"}
        print("TANAW " + json.dumps(out), flush=True)


if __name__ == "__main__":
    main()
