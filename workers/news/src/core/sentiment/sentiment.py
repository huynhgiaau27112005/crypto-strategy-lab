import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from pathlib import Path

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "models" / "finbert"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)

model.eval()

def predict(context: str):
    print("predict function")

    inputs = tokenizer(
        text=context,
        return_tensors="pt",
        truncated=True,
        max_length=512
    )

    print("input: ", inputs)

    with torch.no_grad():
        outputs = model(**inputs)

        print("outputs: ", outputs)

    probabilites = torch.softmax(
        outputs.logits,
        dim=-1
    )

    print("probabilites: ", probabilites)

    prediction = torch.argmax(
        probabilites,
        dim=-1
    ).item()

    print("prediction: ", prediction)

    score = probabilites[0][prediction].item()
    label = model.config.id2label[prediction]

    print("label: ", label)
    print("score: ", score)

    return {
        "label": label,
        "score": score
    }

def main():
    context = "Trump Media’s bitcoin holdings shrink as crypto losses hit $361 million"
    result = predict(context)

    print(result)

if __name__ == "__main__":
    main()