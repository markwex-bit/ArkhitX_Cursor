# HITL Gate Patterns

## What Is a HITL Gate?

A Human-In-The-Loop gate is a point in the pipeline where the system pauses and
presents its work for human review. The consultant reviews, approves (optionally
with modifications), or rejects. Nothing proceeds until the gate is passed.

## Where Gates Occur

| Phase | Gate Name | What's Reviewed |
|-------|-----------|----------------|
| 0 | Signal Gate | Extracted signals, derived BQs — consultant confirms/edits/removes |
| 1 | Schema Gate | Proposed ontology schema — consultant approves entity/relationship design |
| 2 | Mapping Gate | Field mappings from source systems — consultant confirms correctness |
| 3 | Data Gate | Populated graph summary — consultant confirms data looks right |
| 4 | Agent Gate | Agent designs and test results — consultant approves before production |
| 5 | Validation Gate | Solution proof — consultant confirms BQs are answered correctly |

## The Universal Gate Pattern

Every gate follows the same three-part pattern:

### 1. Present (Backend prepares review data)

```python
@router.get("/projects/{project_id}/gates/{gate_name}")
async def get_gate_review(project_id: str, gate_name: str, db=Depends(get_db)):
    """Returns the data that needs human review."""
    project = get_project(db, project_id)

    review_data = prepare_gate_review(db, project, gate_name)

    return {
        "gate_name": gate_name,
        "phase": project.current_phase,
        "status": "pending_review",
        "items": review_data["items"],
        "summary": review_data["summary"],
        "instructions": review_data["instructions"],
    }
```

### 2. Review (Frontend displays for human decision)

```typescript
// Generic HITL Gate component
interface GateReviewProps {
  gateName: string;
  items: GateItem[];
  summary: string;
  instructions: string;
  onApprove: (modifications: GateModification[]) => void;
  onReject: (reason: string) => void;
}

function HITLGateReview({ gateName, items, summary, instructions, onApprove, onReject }: GateReviewProps) {
  // Display items for review
  // Allow inline editing/removal
  // Collect approve/reject decision
}
```

### 3. Decide (Backend records decision and advances)

```python
@router.post("/projects/{project_id}/gates/{gate_name}/decide")
async def decide_gate(
    project_id: str,
    gate_name: str,
    decision: GateDecision,
    db=Depends(get_db)
):
    project = get_project(db, project_id)

    log_audit(db,
        project_id=project_id,
        actor=decision.reviewer,
        action=f"gate_{'approved' if decision.approved else 'rejected'}:{gate_name}",
        context={
            "items_reviewed": decision.items_reviewed,
            "items_modified": decision.modifications,
            "notes": decision.notes,
        }
    )

    if decision.approved:
        apply_gate_modifications(db, project, gate_name, decision.modifications)
        advance_project_phase(db, project_id)
        create_pipeline_event(db, project_id,
            phase=project.current_phase,
            step_name=f"gate_passed:{gate_name}",
            status="completed"
        )
        return {"status": "approved", "next_phase": project.current_phase + 1}
    else:
        create_pipeline_event(db, project_id,
            phase=project.current_phase,
            step_name=f"gate_rejected:{gate_name}",
            status="rejected",
            output_summary={"reason": decision.rejection_reason}
        )
        return {"status": "rejected", "reason": decision.rejection_reason}
```

## Gate-Specific Implementations

### Signal Gate (Phase 0)

**Items:** Extracted signals grouped by type (DC, PS, BI, DN, CP, BQ, PG)
**Actions available:**
- Confirm a signal (keep as-is)
- Edit a signal (modify text, change classification)
- Remove a signal (mark as out of scope)
- Add a new signal (consultant identified something the LLM missed)
- For BQs: separate display of explicit (from Decision Needs) vs. derived (from other sections)

**On approve:** Confirmed signals are stored in `projects.signals` and become the
foundation for ontology design in Phase 1.

### Schema Gate (Phase 1)

**Items:** Proposed entity types, relationship types, and properties
**Display format:**
```
Entity: Supplier
  Properties: name (string), location (string), risk_score (float), tier (enum: 1,2,3)
  Relationships:
    - SUPPLIES -> Component (cardinality: one-to-many)
    - LOCATED_IN -> Region (cardinality: many-to-one)
  Answers BQs: BQ1, BQ3, BQ7
```
**Actions:** Edit properties, add/remove entities, modify relationships
**On approve:** Schema is locked in `projects.ontology_schema`

### Mapping Gate (Phase 2)

**Items:** Source field -> ontology property mappings
**Display format:**
```
Source: sap_suppliers.csv
  Column "VENDOR_NAME" -> Supplier.name
  Column "VENDOR_CITY" -> Supplier.location
  Column "RISK_RATING" -> Supplier.risk_score (transform: scale 1-5 to 0-1)
```
**Actions:** Correct mappings, add transformations, flag unmappable fields
**On approve:** Mappings are stored and used by Phase 3 population scripts

### Validation Gate (Phase 5)

**Items:** Agent execution results showing each BQ answered
**Display format:**
```
BQ1: "Which suppliers pose the highest risk?"
  Agent: supplier_risk
  Answer: "Acme Corp (risk: 0.92), Beta Ltd (risk: 0.85)..."
  Grounding Score: 0.94
  Cited Nodes: Supplier:acme-corp, Supplier:beta-ltd, DisruptionEvent:evt-42
  Query Path: MATCH (s:Supplier) WHERE s.risk_score > 0.7 RETURN s
```
**Actions:** Approve, flag for rework, add notes
**On approve:** Solution is validated, ready for delivery package

## Bidirectional Validation

Every gate validates in both directions:

**Upstream:** Did the previous step faithfully capture its input?
- Signal Gate: Did extraction capture the right signals from the pain point text?
- Schema Gate: Does the ontology cover all confirmed structural signals?

**Downstream:** Can the next step do its job with what this gate produces?
- Signal Gate: Are there enough structural signals for ontology design?
- Schema Gate: Are properties concrete enough for data mapping?
- Mapping Gate: Are mappings complete enough for graph population?

If downstream readiness fails, the gate should warn the consultant:
"Proceeding with 3 unmapped fields. These entities will have incomplete data."

## Frontend Component Pattern

The starter template includes a reusable `HITLGateOverlay` component:

```typescript
// Usage in any phase page:
<HITLGateOverlay
  isOpen={showGate}
  gateName="signal_gate"
  projectId={projectId}
  title="Review Extracted Signals"
  description="Confirm, edit, or remove the signals extracted from the pain points."
  onClose={() => setShowGate(false)}
  onDecided={(result) => {
    if (result.approved) navigateToNextPhase();
  }}
/>
```

The overlay fetches gate review data, renders items with edit/remove controls,
and posts the decision back to the API. It handles both approval and rejection
flows, including the notes/reason fields.
