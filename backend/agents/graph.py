from langgraph.graph import END, START, StateGraph

from agents.nodes import act_node, observe_node, reason_node, respond_node, scope_guard_node
from agents.state import AgentState


def create_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    graph.add_node("scope_guard", scope_guard_node)
    graph.add_node("reason", reason_node)
    graph.add_node("act", act_node)
    graph.add_node("respond", respond_node)

    graph.add_edge(START, "scope_guard")
    graph.add_conditional_edges(
        "scope_guard",
        lambda s: "reason" if s["scope_passed"] else "respond",
    )
    graph.add_edge("reason", "act")
    graph.add_conditional_edges("act", observe_node)
    graph.add_edge("respond", END)

    return graph.compile()


agent = create_graph()
