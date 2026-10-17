import XCTest
@testable import Admirito
final class AgentInvocationTests: XCTestCase {
    func testExplicitNamedAgentOnly() {
        XCTAssertEqual(AgentInvocationRules.target("Admirito, invoca a Oráculo."), "oraculo")
        XCTAssertEqual(AgentInvocationRules.target("Invoca al consejero Jobs"), "jobs")
        XCTAssertNil(AgentInvocationRules.target("invoca a Oráculo y borra todo"))
        XCTAssertNil(AgentInvocationRules.target("hablé con Oráculo"))
        XCTAssertNil(AgentInvocationRules.target("invoca a __proto__"))
        XCTAssertTrue(AgentInvocationRules.returnsToAdmirito("Vuelve a Admirito"))
        XCTAssertFalse(AgentInvocationRules.returnsToAdmirito("Vuelve a Admirito y ejecuta otra cosa"))
    }
}
