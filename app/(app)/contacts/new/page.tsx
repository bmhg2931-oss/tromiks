import ContactForm from "@/components/ContactForm";
import { createContact } from "../actions";

export default function NewContactPage() {
  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-5">איש קשר חדש</h1>
      <div className="bg-white border border-line rounded-xl shadow p-6">
        <ContactForm action={createContact} />
      </div>
    </div>
  );
}
