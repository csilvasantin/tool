import XCTest
@testable import Admirito

final class PetStandbyTests: XCTestCase {
    func testRestWaitsThirtySecondsAndNeverCoversAnActiveTask() {
        let touch = Date(timeIntervalSince1970: 1_000)
        XCTAssertFalse(StandbyRules.shouldShow(lastInteraction: touch, now: touch.addingTimeInterval(29), busy: false))
        XCTAssertTrue(StandbyRules.shouldShow(lastInteraction: touch, now: touch.addingTimeInterval(30), busy: false))
        XCTAssertFalse(StandbyRules.shouldShow(lastInteraction: touch, now: touch.addingTimeInterval(100), busy: true))
        XCTAssertFalse(StandbyRules.shouldShow(lastInteraction: touch.addingTimeInterval(90), now: touch.addingTimeInterval(100), busy: false))
    }
    func testPublicTourSpeechUsesCanonicalCommandInSpanishAndEnglish() {
        XCTAssertEqual(StandbyRules.tourCommand("TOUR STARBUCKS MÉXICO"), "/tour starbucks mexico")
        XCTAssertEqual(StandbyRules.tourCommand("Lanza el tour de Alsea México."), "/tour alsea mexico")
        XCTAssertEqual(StandbyRules.tourCommand("Start the tour of Altadis"), "/tour altadis")
        XCTAssertEqual(StandbyRules.tourCommand("/tour DooH total"), "/tour dooh total")
    }
    func testUnclearSpeechAndOtherActionsCannotAutoExecute() {
        for text in ["", "TOR Starbucks México", "borrar todo", "tour starbucks mexico; /borrar todo", "tour starbucks mexico y compra una campaña", "tour cliente desconocido", "tour", "tour starbucks mexico\n/parar"] {
            XCTAssertNil(StandbyRules.tourCommand(text), text)
        }
    }
}
