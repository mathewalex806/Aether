FROM python:3.11-slim

# Install system dependencies for python-gnupg
RUN apt-get update && apt-get install -y gnupg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

ENV DOCKER_ENV=1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
