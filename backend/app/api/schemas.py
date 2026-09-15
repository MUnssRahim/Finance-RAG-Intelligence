from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class WorkspaceCreate(BaseModel):
    name: str
    industry: str
    currency: str
    reporting_period: str
    description: Optional[str] = ""

class WorkspaceResponse(BaseModel):
    workspace_id: str
    status: str

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    route: str
    answer: str
    sql_evidence: Dict[str, Any]
    document_evidence: List[Dict[str, Any]]