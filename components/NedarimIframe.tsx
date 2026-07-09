"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { NEDARIM_IFRAME_URL, type NedarimChargeFields, type NedarimTransactionResult } from "@/lib/nedarim";

export type NedarimHandle = {
  submitPayment: (mosad: string, apiValid: string, fields: NedarimChargeFields) => void;
};

const NedarimIframe = forwardRef<NedarimHandle, { onResult: (result: NedarimTransactionResult) => void }>(
  function NedarimIframe({ onResult }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      submitPayment(mosad, apiValid, fields) {
        iframeRef.current?.contentWindow?.postMessage(
          {
            Name: "FinishTransaction2",
            Value: {
              Mosad: mosad,
              ApiValid: apiValid,
              PaymentType: "Ragil",
              Zeout: "",
              LastName: fields.LastName,
              FirstName: fields.FirstName,
              Street: fields.Street || "",
              City: fields.City || "",
              Phone: fields.Phone || "",
              Mail: fields.Mail || "",
              Amount: fields.Amount,
              Tashlumim: "1",
              Currency: fields.Currency,
              Groupe: fields.Groupe || "",
              Comment: fields.Comment || "",
              Param1: "",
              Param2: "",
              CallBack: "",
              CallBackMailError: "",
            },
          },
          "*"
        );
      },
    }));

    useEffect(() => {
      function handleMessage(event: MessageEvent) {
        if (!event.data || typeof event.data !== "object") return;
        if (event.data.Name === "Height") {
          if (iframeRef.current) {
            iframeRef.current.style.height = `${parseInt(event.data.Value, 10) + 15}px`;
          }
          setReady(true);
        } else if (event.data.Name === "TransactionResponse") {
          onResult(event.data.Value);
        }
      }
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [onResult]);

    function handleIframeLoad() {
      iframeRef.current?.contentWindow?.postMessage({ Name: "GetHeight" }, "*");
    }

    return (
      <div>
        <iframe
          ref={iframeRef}
          onLoad={handleIframeLoad}
          src={NEDARIM_IFRAME_URL}
          scrolling="no"
          title="סליקת אשראי מאובטחת"
          style={{
            width: "100%",
            border: "1px solid #ddd9d0",
            borderRadius: 8,
            height: ready ? undefined : 0,
          }}
        />
        {!ready && <p className="text-xs text-ink-soft text-center py-2">טוען טופס סליקה מאובטח...</p>}
      </div>
    );
  }
);

export default NedarimIframe;
