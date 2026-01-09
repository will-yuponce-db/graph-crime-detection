# Databricks notebook source
# MAGIC %md
# MAGIC ## Register the “UI Agent” in Databricks (Serving Endpoint + optional MLflow model)
# MAGIC
# MAGIC This notebook helps you:
# MAGIC
# MAGIC - Create/update a **Databricks Model Serving endpoint** your app can call via `DATABRICKS_AGENT_ENDPOINT`.
# MAGIC - (Optional) Register a simple **MLflow pyfunc** model in Unity Catalog and serve it.
# MAGIC
# MAGIC ### Prereqs
# MAGIC - You can create Serving Endpoints in the target workspace.
# MAGIC - You have a PAT or OAuth token with permission to manage endpoints.
# MAGIC
# MAGIC ### Important note
# MAGIC Your app backend currently calls the endpoint with an **OpenAI-style chat payload**:
# MAGIC
# MAGIC ```json
# MAGIC { "messages": [...], "temperature": 0.2, "max_tokens": 700 }
# MAGIC ```
# MAGIC
# MAGIC That typically works best with **foundation-model serving endpoints**. MLflow model serving usually expects `dataframe_split` inputs.
# MAGIC
# MAGIC

# COMMAND ----------

# ==== CONFIG (edit these) ====

# If running in a Databricks notebook, you can often derive the workspace host automatically.
# Otherwise set it explicitly, e.g. "https://e2-demo-field-eng.cloud.databricks.com"
DATABRICKS_HOST = None

# Recommend: store PAT in a secret scope and reference it here.
# Example:
# DATABRICKS_TOKEN = dbutils.secrets.get(scope="my-scope", key="pat")
DATABRICKS_TOKEN = None

# Endpoint the app will call (set this as backend env DATABRICKS_AGENT_ENDPOINT)
# In your workspace, you already have an endpoint you can reuse:
#   https://fe-vm-industry-solutions-buildathon.cloud.databricks.com/serving-endpoints/databricks-gpt-5-2
AGENT_ENDPOINT_NAME = "databricks-gpt-5-2"

# Choose ONE path below.

# Path A (recommended): create a foundation-model endpoint that can accept chat-style payloads.
# Set to a model name you have access to in your workspace.
# Examples vary by workspace; use Serving UI to see available foundation models.
FOUNDATION_MODEL_NAME = "databricks-meta-llama-3-1-70b-instruct"

# Foundation endpoint config schema can vary by workspace.
# Try in this order:
# - "served_entities" (with foundation_model)
# - "served_models" (with model_name)
FOUNDATION_CONFIG_STYLE = "served_entities"  # or "served_models"

# Path B (optional): register a simple MLflow model and serve it.
# Unity Catalog location for the registered model:
UC_CATALOG = "pubsec_geo_law"
UC_SCHEMA = "demo"
UC_MODEL_NAME = "ui_agent_pyfunc"  # full name becomes: pubsec_geo_law.demo.ui_agent_pyfunc


def _get_context_host():
    try:
        # Works in most DBR notebooks
        return dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiUrl().get()
    except Exception:
        return None


if DATABRICKS_HOST is None:
    DATABRICKS_HOST = _get_context_host()

if DATABRICKS_HOST and not DATABRICKS_HOST.startswith("http"):
    DATABRICKS_HOST = "https://" + DATABRICKS_HOST

print("Host:", DATABRICKS_HOST)
print("Endpoint:", AGENT_ENDPOINT_NAME)



# COMMAND ----------

import json
import time
from typing import Any, Dict, Optional

import requests


def _headers():
    if not DATABRICKS_TOKEN:
        raise ValueError("Set DATABRICKS_TOKEN (PAT or OAuth token).")
    return {"Authorization": f"Bearer {DATABRICKS_TOKEN}", "Content-Type": "application/json"}


def _url(path: str) -> str:
    if not DATABRICKS_HOST:
        raise ValueError("Set DATABRICKS_HOST (e.g. https://<workspace>).")
    return DATABRICKS_HOST.rstrip("/") + path


def _raise_for_status_with_body(r: requests.Response):
    try:
        r.raise_for_status()
    except requests.HTTPError as e:
        print("HTTP status:", r.status_code)
        print("Response headers (subset):", {k: r.headers.get(k) for k in ["x-request-id", "content-type"]})
        print("Response body (first 4000 chars):")
        print((r.text or "")[:4000])
        raise e


def get_endpoint(name: str) -> Optional[Dict[str, Any]]:
    r = requests.get(_url(f"/api/2.0/serving-endpoints/{name}"), headers=_headers())
    if r.status_code == 404:
        return None
    _raise_for_status_with_body(r)
    return r.json()


def create_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.post(
        _url("/api/2.0/serving-endpoints"),
        headers=_headers(),
        data=json.dumps(payload),
    )
    _raise_for_status_with_body(r)
    return r.json()


def update_endpoint_config(name: str, config: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.put(
        _url(f"/api/2.0/serving-endpoints/{name}/config"),
        headers=_headers(),
        data=json.dumps(config),
    )
    _raise_for_status_with_body(r)
    return r.json()


def wait_until_ready(name: str, timeout_s: int = 1200):
    start = time.time()
    missing_count = 0
    while True:
        ep = get_endpoint(name)
        if ep is None:
            missing_count += 1
            print("Endpoint not found yet (count=", missing_count, ")")
            if missing_count >= 3:
                raise RuntimeError(
                    f"Endpoint '{name}' not found. If your workspace blocks API creation, create it in the UI first."
                )
            time.sleep(5)
            continue

        state = ep.get("state", {})
        ready = state.get("ready")
        config_update = state.get("config_update")
        print("state.ready=", ready, "state.config_update=", config_update)

        if ready == "READY" and config_update in (None, "NOT_UPDATING", "UPDATE_COMPLETED"):
            return ep

        if time.time() - start > timeout_s:
            raise TimeoutError(f"Endpoint {name} not READY within {timeout_s}s")

        time.sleep(10)



# COMMAND ----------

# MAGIC %md
# MAGIC ## If your workspace blocks endpoint creation via API (your case)
# MAGIC
# MAGIC Your error indicates **Serving Endpoint creation is disabled via REST API** in this workspace.
# MAGIC
# MAGIC ### Create the endpoint manually (recommended)
# MAGIC 1. In Databricks, go to **Serving**
# MAGIC 2. Click **Create serving endpoint**
# MAGIC 3. **Name**: set to the same value as `AGENT_ENDPOINT_NAME` in this notebook (e.g. `ui-agent`)
# MAGIC 4. Choose a **Foundation model** that supports chat/instruct (the backend sends `messages`)
# MAGIC 5. Set **Scale to zero** on (optional)
# MAGIC 6. Create the endpoint and wait until it is **READY**
# MAGIC
# MAGIC ### Then configure the app
# MAGIC Set in your backend environment:
# MAGIC - `DATABRICKS_HOST` = your workspace host (e.g. `https://fe-vm-industry-solutions-buildathon.cloud.databricks.com`)
# MAGIC - `DATABRICKS_TOKEN` = PAT that can invoke serving endpoints
# MAGIC - `DATABRICKS_AGENT_ENDPOINT` = the endpoint name you created (e.g. `ui-agent`)
# MAGIC
# MAGIC After that, run the **smoke test** cell below in this notebook to confirm invocations work.
# MAGIC
# MAGIC

# COMMAND ----------

# === Path A (recommended): reuse an existing serving endpoint ===
#
# Your workspace blocks endpoint creation via API, so this cell ONLY verifies that
# AGENT_ENDPOINT_NAME exists and is READY.

existing = get_endpoint(AGENT_ENDPOINT_NAME)
if existing is None:
    raise RuntimeError(
        f"Serving endpoint '{AGENT_ENDPOINT_NAME}' was not found. "
        "Pick an existing endpoint name, or create one in the Databricks Serving UI."
    )

print("Found endpoint:", existing.get("name"))
print("State:", existing.get("state"))

print("Waiting for READY...")
ready_ep = wait_until_ready(AGENT_ENDPOINT_NAME)
print("READY:", ready_ep.get("state", {}))

print("\nNext: run the smoke test cell to validate /invocations accepts chat-style payloads.")



# COMMAND ----------

# Quick smoke test: invoke the endpoint with a chat-style payload

payload = {
    "messages": [
        {"role": "system", "content": "Return a JSON object with keys assistantMessage and actions."},
        {"role": "user", "content": "Navigate to graph explorer and filter to city=DC"},
    ],
    "temperature": 0.2,
    "max_tokens": 200,
}

r = requests.post(
    _url(f"/api/2.0/serving-endpoints/{AGENT_ENDPOINT_NAME}/invocations"),
    headers=_headers(),
    data=json.dumps(payload),
)
print("Status:", r.status_code)
print(r.text[:2000])



# COMMAND ----------

# MAGIC %md
# MAGIC ## Optional: register a simple MLflow model (Unity Catalog) and serve it
# MAGIC
# MAGIC This section registers a **toy** MLflow `pyfunc` model that returns JSON actions using simple heuristics.
# MAGIC
# MAGIC - This is useful if you want a fully “owned” artifact in MLflow/UC.
# MAGIC - But note: MLflow model serving typically expects `dataframe_split` payloads; if you use this endpoint for the app, you’d need to adjust the backend invocation format.
# MAGIC
# MAGIC

# COMMAND ----------

import pandas as pd
import mlflow
import mlflow.pyfunc
from mlflow.models.signature import ModelSignature
from mlflow.types.schema import Schema, ColSpec


class SimpleUiAgentModel(mlflow.pyfunc.PythonModel):
    def predict(self, context, model_input: pd.DataFrame):
        # Expect a column named "answer" (string)
        answers = model_input.get("answer")
        if answers is None:
            return [json.dumps({"assistantMessage": "Missing 'answer'", "actions": []})] * len(model_input)

        out = []
        for a in answers.astype(str).tolist():
            a_low = a.lower()
            actions = []

            # Very small demo heuristics
            if "graph" in a_low or "network" in a_low:
                actions.append({"type": "navigate", "path": "/graph-explorer"})
            if "heatmap" in a_low or "hotspot" in a_low:
                actions.append({"type": "navigate", "path": "/heatmap"})
            if "case" in a_low:
                actions.append({"type": "navigate", "path": "/evidence-card"})

            if "dc" in a_low or "washington" in a_low:
                actions.append({"type": "setSearchParams", "searchParams": {"city": "DC"}})
            if "nashville" in a_low:
                actions.append({"type": "setSearchParams", "searchParams": {"city": "Nashville"}})

            msg = "OK. I applied navigation/filters based on your answer." if actions else "What would you like to investigate next?"
            out.append(json.dumps({"assistantMessage": msg, "actions": actions}))

        return out


full_model_name = f"{UC_CATALOG}.{UC_SCHEMA}.{UC_MODEL_NAME}"

input_schema = Schema([ColSpec("string", "answer")])
output_schema = Schema([ColSpec("string")])
signature = ModelSignature(inputs=input_schema, outputs=output_schema)

with mlflow.start_run(run_name="register_ui_agent_pyfunc"):
    mlflow.pyfunc.log_model(
        artifact_path="model",
        python_model=SimpleUiAgentModel(),
        signature=signature,
    )
    run_id = mlflow.active_run().info.run_id

model_uri = f"runs:/{run_id}/model"
print("Logged model:", model_uri)

# Register in Unity Catalog model registry
result = mlflow.register_model(model_uri=model_uri, name=full_model_name)
print("Registered:", result.name, "version", result.version)

# Tip: In Serving UI, create an endpoint for this registered model version if you want to serve it.

