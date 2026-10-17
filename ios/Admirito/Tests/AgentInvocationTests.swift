import XCTest
@testable import Admirito
final class AgentInvocationTests: XCTestCase {
    func testExplicitNamedAgentOnly() {
        XCTAssertEqual(AgentInvocationRules.target("Admirito, invoca a Oráculo."), "oraculo")
        XCTAssertEqual(AgentInvocationRules.target("Invoca al consejero Jobs"), "jobs")
        XCTAssertEqual(AgentInvocationRules.target("Admirito, invoca a Bugito"), "bugito")
        XCTAssertEqual(AgentInvocationRules.target("Admirito, invoca a Supervisor"), "supervisor")
        XCTAssertNil(AgentInvocationRules.target("invoca a Bugito y apaga todo"))
        XCTAssertEqual(AgentInvocationRules.target("invoca a Bujito"), "bugito")
        XCTAssertEqual(AgentInvocationRules.mascot("supervisor"), "Supervisor")
        XCTAssertNil(AgentInvocationRules.target("invoca a Oráculo y borra todo"))
        XCTAssertNil(AgentInvocationRules.target("hablé con Oráculo"))
        XCTAssertNil(AgentInvocationRules.target("invoca a __proto__"))
        XCTAssertTrue(AgentInvocationRules.returnsToAdmirito("Vuelve a Admirito"))
        XCTAssertFalse(AgentInvocationRules.returnsToAdmirito("Vuelve a Admirito y ejecuta otra cosa"))
    }
    @MainActor func testSelectedAgentSurvivesRestartAndStaysWithinAccount() {
        let account = "test-" + UUID().uuidString
        let other = "test-" + UUID().uuidString
        let key = "admirito.invocation.\(account)"
        defer { UserDefaults.standard.removeObject(forKey:key + ".target"); UserDefaults.standard.removeObject(forKey:key + ".conversation") }
        UserDefaults.standard.set("oraculo",forKey:key + ".target")
        UserDefaults.standard.set(UUID().uuidString.lowercased(),forKey:key + ".conversation")
        let channel = AgentInvocation(); channel.bind(account)
        XCTAssertEqual(channel.target,"oraculo")
        channel.bind(other); XCTAssertNil(channel.target)
        channel.bind(account); XCTAssertEqual(channel.target,"oraculo")
        channel.selectMascot("bugito"); XCTAssertEqual(channel.target,"bugito")
        channel.selectMascot("supervisor"); XCTAssertEqual(channel.target,"supervisor")
        channel.selectMascot("unknown"); XCTAssertEqual(channel.target,"supervisor")
        channel.leave()
        let restarted = AgentInvocation(); restarted.bind(account)
        XCTAssertNil(restarted.target)
    }
}
