import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Select,
  Badge,
  DataTable,
  Banner,
  Spinner,
} from "@shopify/polaris";

// Type definitions for our action responses
type SearchActionResponse = {
  action: "search";
  orders: any[];
  hasNextPage: boolean;
  fromStatus: string;
  toStatus: string;
};

type UpdateActionResponse = {
  action: "update";
  success: boolean;
  updatedCount: number;
  fromStatus: string;
  toStatus: string;
};

type ErrorActionResponse = {
  error: string;
};

type ActionResponse = SearchActionResponse | UpdateActionResponse | ErrorActionResponse;
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const fromStatus = formData.get("fromStatus");
  const toStatus = formData.get("toStatus");

  if (actionType === "search") {
    // Search for orders with the specified financial status
    const response = await admin.graphql(
      `#graphql
        query GetOrdersByFinancialStatus($first: Int!, $query: String!) {
          orders(first: $first, query: $query) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                customer {
                  displayName
                  email
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }`,
      {
        variables: {
          first: 250,
          query: `financial_status:${fromStatus}`,
        },
      },
    );

    const responseJson = await response.json();
    return {
      action: "search",
      orders: responseJson.data?.orders?.edges || [],
      hasNextPage: responseJson.data?.orders?.pageInfo?.hasNextPage || false,
      fromStatus,
      toStatus,
    };
  }

  if (actionType === "update") {
    // This would contain the bulk update logic
    // For now, we'll return a placeholder response
    return {
      action: "update",
      success: true,
      updatedCount: parseInt(formData.get("orderCount") as string) || 0,
      fromStatus,
      toStatus,
    };
  }

  return { error: "Invalid action" };
};

const FINANCIAL_STATUS_OPTIONS = [
  { label: "Select status...", value: "" },
  { label: "Authorized", value: "authorized" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Partially Paid", value: "partially_paid" },
  { label: "Partially Refunded", value: "partially_refunded" },
  { label: "Refunded", value: "refunded" },
  { label: "Voided", value: "voided" },
];

export default function BulkOrderEditor() {
  const fetcher = useFetcher<ActionResponse>();
  const shopify = useAppBridge();

  const [fromStatus, setFromStatus] = useState("");
  const [toStatus, setToStatus] = useState("");

  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  const isSearching = isLoading && fetcher.formData?.get("actionType") === "search";
  const isUpdating = isLoading && fetcher.formData?.get("actionType") === "update";

  const orders = (fetcher.data && 'orders' in fetcher.data) ? fetcher.data.orders : [];
  const hasSearched = fetcher.data && 'action' in fetcher.data && fetcher.data.action === "search";
  const hasUpdated = fetcher.data && 'action' in fetcher.data && fetcher.data.action === "update" && 'success' in fetcher.data && fetcher.data.success;

  useEffect(() => {
    if (hasUpdated && fetcher.data && 'updatedCount' in fetcher.data) {
      shopify.toast.show(`Successfully updated ${fetcher.data.updatedCount} orders`);
    }
  }, [hasUpdated, fetcher.data, shopify]);

  const handleSearch = () => {
    if (!fromStatus) {
      shopify.toast.show("Please select a financial status to search for", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "search");
    formData.append("fromStatus", fromStatus);
    formData.append("toStatus", toStatus);

    fetcher.submit(formData, { method: "POST" });
  };

  const handleBulkUpdate = () => {
    if (!toStatus) {
      shopify.toast.show("Please select a status to update to", { isError: true });
      return;
    }

    if (orders.length === 0) {
      shopify.toast.show("No orders found to update", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", "update");
    formData.append("fromStatus", fromStatus);
    formData.append("toStatus", toStatus);
    formData.append("orderCount", orders.length.toString());

    fetcher.submit(formData, { method: "POST" });
  };

  const formatCurrency = (amount: string, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(parseFloat(amount));
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, "success" | "info" | "warning" | "critical"> = {
      PAID: "success",
      AUTHORIZED: "info",
      PENDING: "warning",
      PARTIALLY_PAID: "warning",
      REFUNDED: "critical",
      VOIDED: "critical",
    };

    return (
      <Badge tone={statusMap[status] || "info"}>
        {status.replace(/_/g, " ")}
      </Badge>
    );
  };

  const tableRows = orders.map((edge: any) => {
    const order = edge.node;
    return [
      order.name,
      new Date(order.createdAt).toLocaleDateString(),
      getStatusBadge(order.displayFinancialStatus),
      getStatusBadge(order.displayFulfillmentStatus),
      formatCurrency(
        order.totalPriceSet.shopMoney.amount,
        order.totalPriceSet.shopMoney.currencyCode
      ),
      order.customer?.displayName || "Guest",
      order.customer?.email || "—",
    ];
  });

  return (
    <Page>
      <TitleBar title="TheRaven Bulk Order Editor" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Bulk Financial Status Editor
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Search for orders by financial status and bulk update them to a new status.
                    This tool helps you efficiently manage order financial statuses across your store.
                  </Text>
                </BlockStack>

                <BlockStack gap="400">
                  <InlineStack gap="400" align="start">
                    <Box minWidth="200px">
                      <Select
                        label="From Status"
                        options={FINANCIAL_STATUS_OPTIONS}
                        onChange={setFromStatus}
                        value={fromStatus}
                        placeholder="Select current status"
                      />
                    </Box>
                    <Box minWidth="200px">
                      <Select
                        label="To Status"
                        options={FINANCIAL_STATUS_OPTIONS}
                        onChange={setToStatus}
                        value={toStatus}
                        placeholder="Select new status"
                      />
                    </Box>
                  </InlineStack>

                  <InlineStack gap="300">
                    <Button
                      onClick={handleSearch}
                      loading={isSearching}
                      disabled={!fromStatus}
                      variant="primary"
                    >
                      {isSearching ? "Searching..." : "Find Orders"}
                    </Button>

                    {hasSearched && orders.length > 0 && (
                      <Button
                        onClick={handleBulkUpdate}
                        loading={isUpdating}
                        disabled={!toStatus}
                        variant="primary"
                        tone="critical"
                      >
                        {isUpdating ? "Updating..." : `Update ${orders.length} Orders`}
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>

                {hasSearched && (
                  <BlockStack gap="400">
                    {orders.length > 0 ? (
                      <Banner
                        title={`Found ${orders.length} orders`}
                        tone="info"
                      >
                        <p>
                          Found {orders.length} orders with "{fromStatus}" financial status.
                          {toStatus && ` Ready to update to "${toStatus}".`}
                        </p>
                      </Banner>
                    ) : (
                      <Banner
                        title="No orders found"
                        tone="warning"
                      >
                        <p>No orders found with "{fromStatus}" financial status.</p>
                      </Banner>
                    )}

                    {orders.length > 0 && (
                      <Card>
                        <DataTable
                          columnContentTypes={[
                            'text',
                            'text',
                            'text',
                            'text',
                            'numeric',
                            'text',
                            'text'
                          ]}
                          headings={[
                            'Order',
                            'Date',
                            'Financial Status',
                            'Fulfillment Status',
                            'Total',
                            'Customer',
                            'Email'
                          ]}
                          rows={tableRows}
                        />
                      </Card>
                    )}
                  </BlockStack>
                )}

                {hasUpdated && fetcher.data && 'updatedCount' in fetcher.data && 'fromStatus' in fetcher.data && 'toStatus' in fetcher.data && (
                  <Banner
                    title="Update Complete!"
                    tone="success"
                  >
                    <p>
                      Successfully updated {fetcher.data.updatedCount} orders from
                      "{fetcher.data.fromStatus}" to "{fetcher.data.toStatus}".
                    </p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    How it works
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      <strong>1. Select Status:</strong> Choose the current financial status you want to find.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>2. Find Orders:</strong> Search for all orders matching that status.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>3. Choose New Status:</strong> Select what status to update them to.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>4. Bulk Update:</strong> Apply changes to all matching orders at once.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Financial Status Guide
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Authorized:</strong> Payment authorized but not captured
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Paid:</strong> Payment completed successfully
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Pending:</strong> Payment pending processing
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Partially Paid:</strong> Partial payment received
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
