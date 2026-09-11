FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# ArkhitX SDK (editable install from mounted volume)
RUN if [ -d /sdk ]; then pip install --no-cache-dir -e /sdk; fi
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
