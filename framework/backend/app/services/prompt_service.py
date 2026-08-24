from app.models.agent_prompt import AgentPrompt


def get_prompt(db, agent_id: str) -> AgentPrompt | None:
    return db.query(AgentPrompt).filter(AgentPrompt.id == agent_id).first()


def list_prompts(db) -> list[AgentPrompt]:
    return db.query(AgentPrompt).order_by(AgentPrompt.agent_name).all()


def upsert_prompt(db, agent_id: str, data: dict) -> AgentPrompt:
    prompt = db.query(AgentPrompt).filter(AgentPrompt.id == agent_id).first()
    if prompt:
        for key, value in data.items():
            if hasattr(prompt, key) and value is not None:
                setattr(prompt, key, value)
    else:
        prompt = AgentPrompt(id=agent_id, **data)
        db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return prompt


def delete_prompt(db, agent_id: str) -> bool:
    prompt = db.query(AgentPrompt).filter(AgentPrompt.id == agent_id).first()
    if not prompt:
        return False
    db.delete(prompt)
    db.commit()
    return True
