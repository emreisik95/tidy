import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1 className={styles.heading}>Tidy</h1>
          <p className={styles.tagline}>
            Find and fix product data problems in your Shopify store.
          </p>
        </div>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Your store</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="yourstore.myshopify.com"
              />
            </label>
            <button className={styles.button} type="submit">
              Install Tidy
            </button>
          </Form>
        )}

        <div className={styles.features}>
          <div className={styles.feature}>
            <h3>Scan every product</h3>
            <p>
              Tidy checks 11 data points per product - alt text, SEO fields,
              descriptions, categories, barcodes, and more.
            </p>
          </div>
          <div className={styles.feature}>
            <h3>See what's missing</h3>
            <p>
              Each product gets a health score. You see exactly which fields
              are empty and what Google will reject.
            </p>
          </div>
          <div className={styles.feature}>
            <h3>Fix with AI</h3>
            <p>
              Preview AI-generated descriptions, SEO titles, alt text, and
              tags. Apply with one click. Nothing changes until you say so.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
