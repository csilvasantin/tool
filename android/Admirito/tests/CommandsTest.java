package com.admira.admirito;
public class CommandsTest {
 static void equal(Object actual,Object expected){if(!java.util.Objects.equals(actual,expected))throw new AssertionError(actual+" != "+expected);}
 public static void main(String[] args){equal(Commands.tour("Admirito, lanza el tour Starbucks México"),"/tour starbucks mexico");equal(Commands.tour("tour alsea mexico"),"/tour alsea mexico");equal(Commands.tour("tour inventado"),null);equal(Commands.tour("/borrar todo"),null);equal(Commands.invocation("Admirito invoca a Supervisor"),"supervisor");equal(Commands.invocation("invoca a desconocido"),null);equal(Commands.control("Admirito, continúa la demo"),"continua la demo");equal(Commands.control("Admirito, siguiente"),"siguiente");equal(Commands.control("anterior"),"anterior");equal(Commands.control("para la demo"),"para la demo");equal(Commands.control("parar todo"),null);System.out.println("11 command contract checks passed");}
}
