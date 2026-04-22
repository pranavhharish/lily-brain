from models.part import AgentState


def get_initial_state(session_id: str) -> AgentState:
    return AgentState(
        messages=[],
        session_id=session_id,
        scope_passed=False,
        structured_parts=[],
        iteration_count=0,
    )
