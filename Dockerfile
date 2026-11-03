FROM python:3.13-slim-bookworm@sha256:281d39ff02e3b389401586134ff9e6572954687822a58055ec07a60ded4e0b7f
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data
RUN mkdir /app/data && chown 10001:10001 /app/data
COPY server.py cirgrid_data.py index.html login.html ./
COPY src/ ./src/
COPY assets/ ./assets/
USER 10001:10001
EXPOSE 8080
CMD ["python", "server.py"]
