import XCTest
@testable import Admirito
final class PlayerLabTests: XCTestCase {
 func testVoiceRoutesOnlyKnownLabCommands() {
  XCTAssertEqual(PlayerLabAction.parse("Bugito, pon un popup en el Fold"),.popup)
  XCTAssertEqual(PlayerLabAction.parse("Admirito muestra la barra de título en el Samsung Fold"),.title)
  XCTAssertEqual(PlayerLabAction.parse("Supervisor revisa el Fold"),.inspect)
  XCTAssertEqual(PlayerLabAction.parse("pausa el player del Fold"),.pause)
  XCTAssertNil(PlayerLabAction.parse("pon un popup en el MacBook Pro 16"))
  XCTAssertNil(PlayerLabAction.parse("borra todo"))
  XCTAssertEqual(PlayerLabAction.parse("muestra un aviso"),.popup)
  XCTAssertEqual(PlayerLabAction.parse("Bujito muestra un aviso en el Fold"),.popup)
 }
 func testIndependentMeasurementsAndMissingData() throws {
  let now=Date().timeIntervalSince1970*1000
  var display:[String:Any] = ["paintedRotation":0,"rotation":0,"overlay":0.0,"visible":100.0,"chromeTop":0.0,"playbackPaused":false,"canvas":["w":1600.0,"h":900.0],"viewportWidth":1600.0,"viewportHeight":900.0]
  func data(_ seen:Double)->[String:Any] {["screen":"virtual-lab-admirito-fold","lastSeen":seen,"device":["display":display],"item":["title":"Pieza captada"]]}
  XCTAssertTrue(try PlayerLabSnapshot.decode(data(now),now:now).issues.isEmpty)
  display["chromeTop"]=38.0;display["overlay"]=26.0;display["paintedRotation"]=90
  XCTAssertEqual(try PlayerLabSnapshot.decode(data(now),now:now).issues.count,3)
  XCTAssertThrowsError(try PlayerLabSnapshot.decode(data(now-50000),now:now))
  display.removeValue(forKey:"chromeTop")
  XCTAssertThrowsError(try PlayerLabSnapshot.decode(data(now),now:now))
 }
}
