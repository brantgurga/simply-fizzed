import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AvailabilityForm from "./AvailabilityForm";

const catalog = [
  {
    id: "coca-cola",
    brand: "Coca-Cola",
    name: "Cola",
    flavor: "Original",
    aliases: ["Coke"],
  },
  {
    id: "pepsi-cola",
    brand: "Pepsi-Cola",
    name: "Cola",
    flavor: "Original",
    aliases: ["Coke"],
  },
];

describe("AvailabilityForm", () => {
  it("shows ambiguous aliases and submits only an explicitly selected soda id", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(catalog)} />);

    const input = await screen.findByLabelText("Catalog soda");
    await user.type(input, "Coke");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Coca-Cola Cola — Original");
    expect(options[1]).toHaveTextContent("Pepsi-Cola Cola — Original");
    expect(onAdd).not.toHaveBeenCalled();

    await user.click(options[1]!);
    await user.click(screen.getByLabelText("Form"));
    await user.click(screen.getByRole("option", { name: "Bottle" }));
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(catalog[1], "bottle"));
  });

  it("requires an exact catalog selection", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(catalog)} />);

    await screen.findByLabelText("Catalog soda");
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    expect(screen.getByText("Choose an exact soda from the catalog.")).toBeVisible();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
