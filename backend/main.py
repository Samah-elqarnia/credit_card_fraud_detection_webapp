from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import pandas as pd
import joblib
import io

# --- Charger W, b et preprocessor ---
W = np.load("W1.npy") 
b = float(np.load("b1.npy"))
preprocessor = joblib.load("preprocessor.pkl")

# Historique en mémoire
history = []

app = FastAPI(title="Fraud Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_methods=["*"],
    allow_headers=["*"]
)

# --- Schéma de la requête ---
class Transaction(BaseModel):
    type: str
    amount: float
    oldbalanceOrg: float
    newbalanceOrig: float
    oldbalanceDest: float
    newbalanceDest: float
    threshold: float = 0.5

def sigmoid(z):
    z = np.clip(z, -500, 500)
    return 1 / (1 + np.exp(-z))

def predict_label(df: pd.DataFrame, threshold=0.5):
    X = preprocessor.transform(df)

    # Correction biais : PAS D’AJOUT SI W = dimensions exactes
    if X.shape[1] == W.shape[0] - 1:
        X = np.hstack([X, np.ones((X.shape[0], 1))])

    z = X.dot(W) + b
    prob = sigmoid(z).ravel()
    pred = (prob >= threshold).astype(int)
    return pred, prob

# -------------------------------------------------------------------------
# 1) PREDICTION SINGLE
# -------------------------------------------------------------------------
@app.post("/predict")
def predict_single(tx: Transaction):
    df = pd.DataFrame([{
        "type": tx.type,
        "amount": tx.amount,
        "oldbalanceOrg": tx.oldbalanceOrg,
        "newbalanceOrig": tx.newbalanceOrig,
        "oldbalanceDest": tx.oldbalanceDest,
        "newbalanceDest": tx.newbalanceDest
    }])

    try:
        pred, prob = predict_label(df, threshold=tx.threshold)

        entry = {
            "input": df.to_dict(orient="records")[0],
            "prediction": int(pred[0]),
            "label": "Fraud" if pred[0] == 1 else "Normal",
            "probability": float(prob[0])
        }

        history.append(entry)

        return entry

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {e}")


# -------------------------------------------------------------------------
# 2) PREDICTION CSV
# -------------------------------------------------------------------------
@app.post("/predict_csv")
async def predict_csv(file: UploadFile = File(...), threshold: float = 0.5):
    try:
        df = pd.read_csv(io.BytesIO(await file.read()))

        required_columns = [
            "type", "amount", "oldbalanceOrg", 
            "newbalanceOrig", "oldbalanceDest", "newbalanceDest"
        ]

        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(400, f"Missing column {col}")

        preds, probs = predict_label(df, threshold)

        df["prediction"] = preds
        df["probability"] = probs
        df["label"] = df["prediction"].apply(lambda x: "Fraud" if x else "Normal")

        # Ajouter au history
        for _, row in df.iterrows():
            history.append(row.to_dict())

        return df.to_dict(orient="records")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV prediction failed: {e}")


# -------------------------------------------------------------------------
# 3) HISTORIQUE DES PREDICTIONS
# -------------------------------------------------------------------------
@app.get("/history")
def get_history():
    return history[-500:]   # max 500 entrées


# -------------------------------------------------------------------------
# 4) STATISTIQUES GLOBALES
# -------------------------------------------------------------------------
@app.get("/stats")
def get_stats():
    if len(history) == 0:
        return {"fraud_rate": 0, "total": 0, "frauds": 0, "normal": 0}

    df = pd.DataFrame(history)

    total = len(df)
    frauds = df[df["prediction"] == 1].shape[0]
    normals = total - frauds

    return {
        "total": total,
        "frauds": frauds,
        "normal": normals,
        "fraud_rate": frauds / total
    }

