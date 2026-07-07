import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Heart,
  ArrowRight,
  Trash2,
  Settings,
  Lock,
  ReceiptText } from
'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useApp } from '../context/AppContext';
import { products } from '../data/catalog';
export function Cart() {
  const { cartLines, cartTotal, updateCartQuantity, removeFromCart } = useApp();

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Shopping Cart
        </h1>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {cartLines.length} {cartLines.length === 1 ? 'Item' : 'Items'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {cartLines.map((item, i) =>
          <motion.div
            key={item.product.id}
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: i * 0.1
            }}>
            
              <Card className="overflow-hidden">
                <CardContent className="p-4 flex gap-4 items-center">
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <img
                    src={item.product.image}
                    alt={item.product.title}
                    className="w-full h-full object-cover" />
                  
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-lg truncate">
                      {item.product.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Sold by {item.product.seller}
                    </p>
                    <div className="flex items-center gap-4">
                      <select
                        value={item.quantity}
                        onChange={(event) =>
                        updateCartQuantity(item.product.id, Number(event.target.value))
                        }
                        className="bg-secondary border-none text-sm rounded-md px-2 py-1 focus:ring-1 focus:ring-primary outline-none">
                        
                        <option>1</option>
                        <option>2</option>
                        <option>3</option>
                        <option>4</option>
                        <option>5</option>
                      </select>
                      <button
                        onClick={() => {
                          removeFromCart(item.product.id);
                          toast.success('Item removed from cart');
                        }}
                        className="text-sm text-destructive hover:underline flex items-center gap-1">
                        
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">
                      {`R ${(item.product.price * item.quantity).toLocaleString('en-ZA')}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {!cartLines.length ?
          <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <h3 className="text-xl font-semibold mb-2">Your cart is empty</h3>
                <p className="text-muted-foreground mb-4">
                  Add products from the marketplace to start checkout.
                </p>
                <Button asChild>
                  <Link to="/marketplace">Browse marketplace</Link>
                </Button>
              </CardContent>
            </Card> :
          null
          }
        </div>

        <div>
          <Card className="sticky top-24">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{`R ${cartTotal.toLocaleString('en-ZA')}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-medium text-success">Free</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">Calculated at checkout</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between items-center">
                  <span className="font-semibold text-base">Total</span>
                  <span className="font-bold text-xl">{`R ${cartTotal.toLocaleString('en-ZA')}`}</span>
                </div>
              </div>
              <Button asChild className="w-full h-12 text-base group" disabled={!cartLines.length}>
                <Link to={cartLines.length ? '/checkout' : '/cart'}>
                  Proceed to Checkout
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-4 flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" /> Secure encrypted checkout
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>);

}

export function Checkout() {
  const navigate = useNavigate();
  const { cartLines, cartTotal, createOrder } = useApp();
  const [deliveryAddress, setDeliveryAddress] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('card');

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const order = await createOrder({ deliveryAddress, paymentMethod });
      toast.success(`Order ${order.receiptNumber} created`);
      navigate('/orders');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create order');
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Checkout</h1>
          <p className="text-muted-foreground">
            Order creation is wired locally and ready for payment-provider integration.
          </p>
        </div>
        <Badge variant="secondary">{cartLines.length} items</Badge>
      </div>

      {!cartLines.length ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
            <Button asChild>
              <Link to="/marketplace">Browse marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form className="grid grid-cols-1 lg:grid-cols-3 gap-8" onSubmit={submitOrder}>
          <Card className="lg:col-span-2">
            <CardContent className="p-6 space-y-5">
              <div>
                <label className="text-sm font-medium" htmlFor="deliveryAddress">
                  Delivery address
                </label>
                <textarea
                  id="deliveryAddress"
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Street, suburb, city, postal code"
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Payment method</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    ['card', 'Card'],
                    ['manual_eft', 'Manual EFT'],
                    ['wallet', 'Wallet'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentMethod(value)}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        paymentMethod === value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Card and wallet are simulated here. Connect PayFast, Peach Payments, Stripe, or
                your PSP in the backend to authorize real payments.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4">Review order</h2>
              <div className="space-y-3 mb-6">
                {cartLines.map((item) => (
                  <div key={item.product.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {item.quantity} x {item.product.title}
                    </span>
                    <span className="font-medium">
                      R {(item.product.price * item.quantity).toLocaleString('en-ZA')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3 flex justify-between items-center mb-6">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-xl">R {cartTotal.toLocaleString('en-ZA')}</span>
              </div>
              <Button className="w-full h-12" type="submit">
                Place order
              </Button>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}

export function OrderHistory() {
  const { orders, requestRefund } = useApp();

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl min-h-[70vh]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Order History</h1>
          <p className="text-muted-foreground">Receipts, payment status, and refund requests.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/cart">Cart</Link>
        </Button>
      </div>

      {!orders.length ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <ReceiptText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No orders yet</h2>
            <p className="text-muted-foreground mb-4">Completed checkouts will appear here.</p>
            <Button asChild>
              <Link to="/marketplace">Shop marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold">{order.receiptNumber}</h2>
                    <p className="text-sm text-muted-foreground">{order.createdAt}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{order.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline">{order.paymentStatus.replace('_', ' ')}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {order.lines.map((line) => (
                    <div key={line.productId} className="flex justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {line.quantity} x {line.title}
                      </span>
                      <span>R {(line.quantity * line.unitPrice).toLocaleString('en-ZA')}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 border-t border-border pt-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">{order.deliveryAddress}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">R {order.total.toLocaleString('en-ZA')}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={order.status === 'refunded'}
                      onClick={() => {
                        void requestRefund(order.id).then(() => {
                          toast.success('Refund request marked for review');
                        });
                      }}
                    >
                      Request refund
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
export function Wishlist() {
  const { wishlistIds, toggleWishlist, sellerListings } = useApp();
  const wishlistProducts = React.useMemo(
    () =>
      wishlistIds
        .map(
          (id) =>
            sellerListings.find((listing) => listing.id === id) ??
            products.find((product) => product.id === id)
        )
        .filter((item): item is (typeof products)[number] => Boolean(item)),
    [wishlistIds, sellerListings]
  );

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl min-h-[70vh]">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Your Wishlist
        </h1>
        <Badge variant="secondary">{wishlistProducts.length} saved</Badge>
      </div>

      {!wishlistProducts.length ?
      <div className="text-center py-20 bg-card border border-border border-dashed rounded-2xl">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Your wishlist is empty</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Save items you love to your wishlist to keep track of them or buy them
            later.
          </p>
          <Button asChild>
            <Link to="/marketplace">Start Shopping</Link>
          </Button>
        </div> :
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {wishlistProducts.map((item) =>
        <Card key={item.id}>
              <CardContent className="p-4 flex gap-4 items-center">
                <img src={item.image} alt={item.title} className="w-20 h-20 rounded-lg object-cover" />
                <div className="flex-1">
                  <p className="font-medium line-clamp-2">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{`R ${item.price.toLocaleString('en-ZA')}`}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toggleWishlist(item.id);
                    toast.success('Removed from wishlist');
                  }}>
                  
                  Remove
                </Button>
              </CardContent>
            </Card>
        )}
        </div>
      }
    </div>);

}
export function Notifications() {
  const { notifications, markNotificationRead, clearAllNotifications } = useApp();

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl min-h-[70vh]">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Notifications
        </h1>
        <Button variant="ghost" size="icon" onClick={clearAllNotifications} aria-label="Mark all read">
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-4">
        {notifications.map((notif, i) =>
        <motion.div
          key={notif.id}
          initial={{
            opacity: 0,
            y: 10
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            delay: i * 0.1
          }}>
          
            <Card
            className={`overflow-hidden transition-colors hover:bg-muted/50 cursor-pointer ${notif.unread ? 'border-primary/50 bg-primary/5' : ''}`}>
            
              <CardContent
                className="p-4 flex gap-4 items-start"
                onClick={() => markNotificationRead(notif.id)}>
                <div
                className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${notif.unread ? 'bg-primary' : 'bg-transparent'}`} />
              
                <div className="flex-1">
                  <h3
                  className={`font-medium ${notif.unread ? 'text-foreground' : 'text-muted-foreground'}`}>
                  
                    {notif.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {notif.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {notif.createdAt}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
        {!notifications.length ?
        <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              You have no notifications yet.
            </CardContent>
          </Card> :
        null
        }
      </div>
    </div>);

}
