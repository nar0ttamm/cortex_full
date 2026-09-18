import type { Metadata } from "next";
import { GetStartedFlow } from "./GetStartedFlow";

export const metadata: Metadata = {
  title: "Get started — CortexFlow AI",
  description: "Stand up an AI calling CRM workspace in a few guided steps.",
};

export default function GetStartedPage() {
  return <GetStartedFlow />;
}
